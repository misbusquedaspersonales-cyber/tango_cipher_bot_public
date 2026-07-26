/**
 * secure-vault.js
 *
 * Client-side counterpart to scripts/build_encrypted_bundle.py.
 *
 * Two separate encryption layers, don't conflate them:
 *
 *   Layer 1 -- "deploy bundle": encrypted by CI under CLAVE_DESPLIEGUE.
 *              Public, static, shipped with the PWA. Unlocked ONCE on first
 *              run (unlockDeployBundle). The result (tangos.json + tango
 *              SALT) then needs to be persisted locally -- Layer 2 exists so
 *              that persisted copy isn't just sitting in IndexedDB as plaintext.
 *
 *   Layer 2 -- "device vault": the *unlocked* Layer-1 payload, re-encrypted
 *              under a PIN the user sets on this device, and stored in
 *              IndexedDB. Opened every day via openDeviceVault(pin).
 *
 * IMPORTANT TRADE-OFF -- read this before wiring up the "no password day to
 * day" flow from the original spec:
 *
 *   If you want zero friction after first run (open the PWA and go, no PIN),
 *   the device-vault key has to be retrievable without a secret the user
 *   provides -- which means it's not really "encrypted at rest" in any
 *   meaningful sense (anything with access to the device's storage can
 *   derive the same key the app does). That was the original plan and it
 *   is a legitimate choice if convenience matters more than protecting a
 *   stolen/borrowed device -- just don't call it "cero-conocimiento" in
 *   the docs if you go this route.
 *
 *   This module implements the PIN-gated version (openDeviceVault requires
 *   a real PIN every time) because it's the only one that's actually
 *   "encrypted at rest." If you want the frictionless version instead, skip
 *   sealForDevice/openDeviceVault and just store the unlocked payload
 *   directly in IndexedDB -- but do that as a conscious choice, not a default.
 *
 * KDF: PBKDF2-HMAC-SHA256, matching build_encrypted_bundle.py exactly (Web
 * Crypto's SubtleCrypto doesn't support Argon2id/scrypt without a WASM
 * library -- see the note in that script for why).
 */

const KDF_ITERATIONS_DEPLOY_DEFAULT = 600_000; // must match the CI script; bundle also carries its own value
const KDF_ITERATIONS_PIN = 600_000;            // PINs are low-entropy (short, numeric) -- keep this high
const PIN_SALT_LEN = 16;
const NONCE_LEN = 12;
const DEVICE_VAULT_AAD = new TextEncoder().encode("tango-cifrado-device-vault-v1");

// ---------- helpers ----------

function b64ToBytes(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}

function bytesToB64(bytes) {
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
}

async function deriveAesKey(passphrase, saltBytes, iterations) {
    const passBytes = new TextEncoder().encode(passphrase);
    const keyMaterial = await crypto.subtle.importKey(
        'raw', passBytes, { name: 'PBKDF2' }, false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

// ---------- Layer 1: deploy bundle (first run only) ----------

/**
 * Decrypts the public encrypted-bundle.json produced by CI.
 * Throws if claveDespliegue is wrong or the bundle was tampered with
 * (SubtleCrypto rejects on GCM tag mismatch, same as the Python side).
 *
 * @param {string} claveDespliegue - the deploy passphrase, entered once by the user
 * @param {object} bundle - parsed encrypted-bundle.json
 * @returns {Promise<{tangos: object, salt: number}>}
 */
export async function unlockDeployBundle(claveDespliegue, bundle) {
    if (bundle.kdf !== 'PBKDF2-HMAC-SHA256') {
        throw new Error(`KDF no soportado: ${bundle.kdf}`);
    }
    const kdfSalt = b64ToBytes(bundle.kdf_salt_b64);
    const nonce = b64ToBytes(bundle.nonce_b64);
    const ciphertext = b64ToBytes(bundle.ciphertext_b64);
    const aad = new TextEncoder().encode(bundle.aad);

    const key = await deriveAesKey(claveDespliegue, kdfSalt, bundle.kdf_iterations || KDF_ITERATIONS_DEPLOY_DEFAULT);

    let plaintextBuf;
    try {
        plaintextBuf = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: nonce, additionalData: aad },
            key,
            ciphertext
        );
    } catch (err) {
        // SubtleCrypto throws a generic OperationError on tag mismatch --
        // deliberately don't leak whether it was the password or corruption.
        throw new Error('Clave de despliegue incorrecta, o el paquete está corrompido.');
    }

    const payload = JSON.parse(new TextDecoder().decode(plaintextBuf));
    return payload; // { tangos, salt }
}

// ---------- Layer 2: device vault (day to day, PIN-gated) ----------

/**
 * Re-encrypts the unlocked payload under a user-chosen PIN and returns a
 * sealed object ready to store in IndexedDB.
 *
 * @param {string} pin
 * @param {{tangos: object, salt: number}} payload
 * @returns {Promise<object>} sealed vault record
 */
export async function sealForDevice(pin, payload) {
    const pinSalt = crypto.getRandomValues(new Uint8Array(PIN_SALT_LEN));
    const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LEN));
    const key = await deriveAesKey(pin, pinSalt, KDF_ITERATIONS_PIN);

    const plaintext = new TextEncoder().encode(JSON.stringify(payload));
    const ciphertextBuf = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: nonce, additionalData: DEVICE_VAULT_AAD },
        key,
        plaintext
    );

    return {
        version: 1,
        kdf_iterations: KDF_ITERATIONS_PIN,
        pin_salt_b64: bytesToB64(pinSalt),
        nonce_b64: bytesToB64(nonce),
        ciphertext_b64: bytesToB64(new Uint8Array(ciphertextBuf)),
    };
}

/**
 * Opens a sealed device vault record with the user's PIN.
 *
 * @param {string} pin
 * @param {object} sealed - record previously returned by sealForDevice
 * @returns {Promise<{tangos: object, salt: number}>}
 */
export async function openDeviceVault(pin, sealed) {
    const pinSalt = b64ToBytes(sealed.pin_salt_b64);
    const nonce = b64ToBytes(sealed.nonce_b64);
    const ciphertext = b64ToBytes(sealed.ciphertext_b64);

    const key = await deriveAesKey(pin, pinSalt, sealed.kdf_iterations);

    let plaintextBuf;
    try {
        plaintextBuf = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: nonce, additionalData: DEVICE_VAULT_AAD },
            key,
            ciphertext
        );
    } catch (err) {
        throw new Error('PIN incorrecto.');
    }

    return JSON.parse(new TextDecoder().decode(plaintextBuf));
}

// ---------- IndexedDB persistence (thin wrapper) ----------

const DB_NAME = 'tango-cifrado-vault';
const STORE_NAME = 'vault';
const RECORD_KEY = 'sealed-bundle';

function openDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
            req.result.createObjectStore(STORE_NAME);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

export async function saveSealedVault(sealed) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(sealed, RECORD_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function loadSealedVault() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(RECORD_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
}

export async function hasSealedVault() {
    return (await loadSealedVault()) !== null;
}

// ---------- Frictionless flow (no daily PIN) ----------
//
// DESIGN CHOICE: this app prioritises zero friction over at-rest encryption
// of the device copy. After the one-time first-run unlock (unlockDeployBundle),
// the payload is stored in IndexedDB as plain JSON — no PIN required on
// subsequent opens. Anyone with physical access to the device's IndexedDB
// could read it, but the corpus never travels over the network in plaintext
// and Telegram only ever sees ciphertext.
//
// The PIN-gated path (sealForDevice / openDeviceVault) is implemented above
// for deployments where at-rest protection matters more than convenience.
// To switch, replace savePayloadDirect/loadPayloadDirect calls in app.js
// with sealForDevice/openDeviceVault.

const PAYLOAD_KEY = 'payload';

export async function savePayloadDirect(payload) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(JSON.stringify(payload), PAYLOAD_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function loadPayloadDirect() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(PAYLOAD_KEY);
        req.onsuccess = () => resolve(req.result ? JSON.parse(req.result) : null);
        req.onerror = () => reject(req.error);
    });
}

export async function hasPayloadDirect() {
    return (await loadPayloadDirect()) !== null;
}
