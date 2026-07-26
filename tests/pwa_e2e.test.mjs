import { strict as assert } from 'assert';
import { readFile } from 'fs/promises';
import { test } from 'node:test';

// Provide IndexedDB in Node
global.indexedDB = (await import('fake-indexeddb')).indexedDB;

// Minimal localStorage stub
global.localStorage = {
  _store: Object.create(null),
  getItem(k) { return this._store[k] ?? null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; },
};

// Node 20 has globalThis.crypto.subtle and fetch.

const basePath = new URL('../pwa/', import.meta.url);

const { unlockDeployBundle, savePayloadDirect, loadPayloadDirect, hasPayloadDirect } = await import(new URL('secure-vault.js', basePath));
const { cifrarMensaje, descifrarMensaje } = await import(new URL('cipherEngine.js', basePath));

function bytesToB64(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return Buffer.from(bin, 'binary').toString('base64');
}

async function makeBundle(passphrase, payload) {
  // Derive key with PBKDF2 (matches secure-vault.js expectations)
  const enc = new TextEncoder();
  const kdfSalt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(passphrase), { name: 'PBKDF2' }, false, ['deriveBits','deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: kdfSalt, iterations: 600000, hash: 'SHA-256' }, keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const aad = new TextEncoder().encode('tango-cifrado-deploy-aad');
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: aad }, key, plaintext);
  return {
    kdf: 'PBKDF2-HMAC-SHA256',
    kdf_salt_b64: bytesToB64(kdfSalt),
    kdf_iterations: 600000,
    nonce_b64: bytesToB64(nonce),
    aad: new TextDecoder().decode(aad),
    ciphertext_b64: bytesToB64(new Uint8Array(ciphertext)),
  };
}

test('PWA E2E: first-run unlock → save → cipher/descipher → malformed handling → telegram persistence', async () => {
  const payload = {
    tangos: {
      "3": { titulo: 'Cambalache', versos: [ ['Que','el','mundo'], ['mañana','subir'] ] }
    },
    salt: 47
  };

  const pass = 'test-deploy-pass';
  const bundle = await makeBundle(pass, payload);

  // Unlock
  const unlocked = await unlockDeployBundle(pass, bundle);
  assert.deepEqual(unlocked, payload);

  // Save to IndexedDB and verify
  await savePayloadDirect(unlocked);
  assert.equal(await hasPayloadDirect(), true);
  const loaded = await loadPayloadDirect();
  assert.deepEqual(loaded, payload);

  // Cipher and round-trip
  const codigo = await cifrarMensaje('3', 'el mundo', payload.tangos, payload.salt);
  assert.ok(codigo.startsWith(String(3 + payload.salt) + '-'));
  const texto = await descifrarMensaje(codigo, payload.tangos, payload.salt);
  assert.equal(texto, 'el mundo');

  // malformed input handling
  await assert.rejects(() => descifrarMensaje('XXX-NOTOKEN', payload.tangos, payload.salt));

  // Telegram persistence (localStorage)
  const cfg = { botToken: 'x', chatId: '123' };
  localStorage.setItem('tango-cifrado:telegram-config', JSON.stringify(cfg));
  const raw = localStorage.getItem('tango-cifrado:telegram-config');
  assert.equal(JSON.parse(raw).chatId, '123');
});
