/**
 * deeplink.test.mjs
 *
 * Tests for the deep-link reception logic introduced in Fase 7.1:
 *   - consumeDeepLink(): reads #c=... from location.hash, clears it,
 *     returns decoded ciphertext or null.
 *   - buildSendMessageBody(): verifies the inline_keyboard button shape
 *     for the Telegram sendMessage call.
 *
 * Imports the real implementations from pwa/deeplink.js (TO_FIX.md F-6
 * resolved). No more inline copies that must be kept in sync by hand.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { consumeDeepLink, buildDeepLink, buildSendMessageBody, chunkCipherText } from '../../pwa/deeplink.js';

// ---------- stubs ----------

// Minimal location/history stub — consumeDeepLink() only reads location.hash
// and calls history.replaceState, nothing else.
function makeLocation(hash) {
    return {
        hash,
        pathname: '/pwa/index.html',
        search: '',
        origin: 'https://example.github.io',
    };
}

function makeHistory() {
    const calls = [];
    return {
        calls,
        replaceState(state, title, url) { calls.push(url); },
    };
}

// ---------- consumeDeepLink tests ----------

test('consumeDeepLink: returns null when no fragment', () => {
    const loc = makeLocation('');
    const hist = makeHistory();
    assert.equal(consumeDeepLink(loc, hist), null);
    assert.equal(hist.calls.length, 0); // no replaceState called
});

test('consumeDeepLink: returns null for unrelated fragment', () => {
    const loc = makeLocation('#something-else');
    const hist = makeHistory();
    assert.equal(consumeDeepLink(loc, hist), null);
    assert.equal(hist.calls.length, 0);
});

test('consumeDeepLink: decodes a simple ciphertext fragment', () => {
    const cipher = '50-V01P02-~20-V01P03';
    const loc = makeLocation('#c=' + encodeURIComponent(cipher));
    const hist = makeHistory();
    assert.equal(consumeDeepLink(loc, hist), cipher);
});

test('consumeDeepLink: clears the hash via replaceState', () => {
    const loc = makeLocation('#c=' + encodeURIComponent('50-V01P02'));
    const hist = makeHistory();
    consumeDeepLink(loc, hist);
    assert.equal(hist.calls.length, 1);
    assert.equal(hist.calls[0], '/pwa/index.html'); // pathname + empty search
});

test('consumeDeepLink: decodes special characters in ciphertext', () => {
    const cipher = '50-#0b54835392^C-~20-#7b8794-~3f';
    const loc = makeLocation('#c=' + encodeURIComponent(cipher));
    const hist = makeHistory();
    assert.equal(consumeDeepLink(loc, hist), cipher);
});

test('consumeDeepLink: returns null for malformed percent-encoding', () => {
    const loc = makeLocation('#c=%ZZ');   // invalid percent sequence
    const hist = makeHistory();
    assert.equal(consumeDeepLink(loc, hist), null);
});

// ---------- buildDeepLink tests ----------

test('buildDeepLink: produces correct fragment URL', () => {
    const cipher = '50-V01P02-~20-V01P03';
    const url = buildDeepLink('https://example.github.io', '/pwa/index.html', '', cipher);
    assert.equal(url, 'https://example.github.io/pwa/index.html#c=' + encodeURIComponent(cipher));
});

test('buildDeepLink: preserves search param before fragment', () => {
    const url = buildDeepLink('https://x.io', '/pwa/index.html', '?src=twa-apk', '50-V01P02');
    assert.ok(url.includes('?src=twa-apk#c='), 'search comes before fragment');
});

// ---------- buildSendMessageBody / reply_markup tests ----------

test('reply_markup: includes inline_keyboard with Descifrar button', () => {
    const deepLink = buildDeepLink('https://x.io', '/pwa/index.html', '', '50-V01P02');
    const body = buildSendMessageBody('50-V01P02', '123456', deepLink);
    assert.ok(body.reply_markup, 'reply_markup present');
    assert.ok(Array.isArray(body.reply_markup.inline_keyboard), 'inline_keyboard is array');
    const btn = body.reply_markup.inline_keyboard[0][0];
    assert.equal(btn.text, 'Descifrar →');
    assert.ok(btn.url.includes('#c='), 'button url contains fragment');
});

test('reply_markup: button url contains the ciphertext as encoded fragment', () => {
    const cipher = '50-V01P02-~20-#7b8794';
    const deepLink = buildDeepLink('https://x.io', '/pwa/index.html', '', cipher);
    const body = buildSendMessageBody(cipher, '123', deepLink);
    const btn = body.reply_markup.inline_keyboard[0][0];
    assert.equal(decodeURIComponent(btn.url.split('#c=')[1]), cipher);
});

test('reply_markup: preserves ciphertext unchanged in text field', () => {
    const cipher = '50-V01P02';
    const deepLink = buildDeepLink('https://x.io', '/pwa/index.html', '', cipher);
    const body = buildSendMessageBody(cipher, '123', deepLink);
    assert.equal(body.text, cipher);
});

// ---------- chunkCipherText tests ----------

// Helper: build a ciphertext of exactly n tokens, each token is a fixed width
// so we can predict chunk boundaries precisely.
function makeCipher(nTokens, tokenWidth = 6) {
    // token format: "V01P01" (6 chars). separator "-" adds 1 char between tokens.
    return Array.from({ length: nTokens }, (_, i) => {
        const n = String(i + 1).padStart(2, '0');
        return `V${n}P${n}`;
    }).join('-');
}

test('chunkCipherText: short message returns single element, no prefix', () => {
    const cipher = '50-V01P02-~20-V01P03';
    const result = chunkCipherText(cipher, 4096);
    assert.equal(result.length, 1);
    assert.equal(result[0], cipher); // no prefix added for single chunk
});

test('chunkCipherText: single chunk equals original ciphertext', () => {
    const cipher = '50-V01P02';
    assert.deepEqual(chunkCipherText(cipher, 4096), [cipher]);
});

test('chunkCipherText: message exactly at limit stays one chunk', () => {
    const cipher = 'A'.repeat(4096);
    const result = chunkCipherText(cipher, 4096);
    assert.equal(result.length, 1);
});

test('chunkCipherText: message one char over limit splits into two chunks', () => {
    // Build a cipher that is one char longer than maxLen so the fast path
    // doesn't apply, then ensure there is a token boundary to split on.
    // Use maxLen=100 for clarity. effectiveMax = 100 - 8 = 92.
    // token1 = 92 'A's fits (currentLen=92). token2 = 'X' -> addLen=2,
    // 92+2=94 > 92 -> new chunk. Total raw length = 92+1+1 = 94 < 100,
    // but after prefix "[1/2] " (6 chars) chunk0 = 98 chars <= 100. ✓
    const t1 = 'A'.repeat(92);
    const t2 = 'X';
    const cipher = `${t1}-${t2}`; // length 94, just under 100 — BUT we pass maxLen=90
    // With maxLen=90, effectiveMax=82: t1(92) > 82 so t1 itself is one chunk,
    // t2 is another. Let's use a maxLen where the cipher clearly exceeds it.
    const result = chunkCipherText(`${t1}-${t2}`, 90);
    assert.equal(result.length, 2);
    assert.ok(result[0].startsWith('[1/2] '), 'first chunk has prefix');
    assert.ok(result[1].startsWith('[2/2] '), 'second chunk has prefix');
});

test('chunkCipherText: all chunks fit within maxLen', () => {
    // 200 tokens of "V01P01" (6 chars each) → total ~1399 chars, split with maxLen=200
    const cipher = makeCipher(200, 6);
    const result = chunkCipherText(cipher, 200);
    for (const chunk of result) {
        assert.ok(chunk.length <= 200, `chunk too long: ${chunk.length}`);
    }
});

test('chunkCipherText: chunks reassemble to original ciphertext', () => {
    const cipher = makeCipher(100, 6);
    const result = chunkCipherText(cipher, 100);
    assert.ok(result.length > 1, 'expected multiple chunks');
    // Strip "[i/N] " prefix from each chunk and rejoin
    const stripped = result.map(c => c.replace(/^\[\d+\/\d+\] /, ''));
    assert.equal(stripped.join('-'), cipher);
});

test('chunkCipherText: chunks are numbered sequentially', () => {
    const cipher = makeCipher(100, 6);
    const result = chunkCipherText(cipher, 100);
    const n = result.length;
    result.forEach((chunk, i) => {
        assert.ok(chunk.startsWith(`[${i + 1}/${n}] `), `chunk ${i} has wrong prefix`);
    });
});

test('chunkCipherText: no chunk splits a token in the middle', () => {
    // Every chunk body (after stripping prefix) should not start or end with '-'
    const cipher = makeCipher(50, 6);
    const result = chunkCipherText(cipher, 80);
    for (const chunk of result) {
        const body = chunk.replace(/^\[\d+\/\d+\] /, '');
        assert.ok(!body.startsWith('-'), 'chunk body starts with -');
        assert.ok(!body.endsWith('-'), 'chunk body ends with -');
    }
});

test('chunkCipherText: empty string returns single empty chunk', () => {
    const result = chunkCipherText('', 4096);
    assert.equal(result.length, 1);
    assert.equal(result[0], '');
});
