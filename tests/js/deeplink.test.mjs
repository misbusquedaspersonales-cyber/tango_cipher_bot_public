/**
 * deeplink.test.mjs
 *
 * Tests for the deep-link reception logic introduced in Fase 7.1:
 *   - consumeDeepLink(): reads ?c=... from location.search, clears it,
 *     returns decoded ciphertext or null.
 *   - buildDeepLink(): builds a ?c= query-param URL (NOT #c= fragment —
 *     Telegram Android strips fragments before passing URLs to intents).
 *   - buildSendMessageBody(): verifies the inline_keyboard button shape.
 *
 * Imports the real implementations from pwa/deeplink.js (TO_FIX.md F-6).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { consumeDeepLink, buildDeepLink, buildSendMessageBody, chunkCipherText } from '../../pwa/deeplink.js';

// ---------- stubs ----------

function makeLocation({ search = '', hash = '', pathname = '/pwa/index.html' } = {}) {
    return { search, hash, pathname, origin: 'https://example.github.io' };
}

function makeHistory() {
    const calls = [];
    return {
        calls,
        replaceState(state, title, url) { calls.push(url); },
    };
}

// ---------- consumeDeepLink tests ----------

test('consumeDeepLink: returns null when no query param', () => {
    const loc = makeLocation({ search: '' });
    const hist = makeHistory();
    assert.equal(consumeDeepLink(loc, hist), null);
    assert.equal(hist.calls.length, 0);
});

test('consumeDeepLink: returns null for unrelated query params', () => {
    const loc = makeLocation({ search: '?src=twa-apk' });
    const hist = makeHistory();
    assert.equal(consumeDeepLink(loc, hist), null);
    assert.equal(hist.calls.length, 0);
});

test('consumeDeepLink: decodes a simple ciphertext from ?c=', () => {
    const cipher = '50-V01P02-~20-V01P03';
    const loc = makeLocation({ search: '?c=' + encodeURIComponent(cipher) });
    const hist = makeHistory();
    assert.equal(consumeDeepLink(loc, hist), cipher);
});

test('consumeDeepLink: removes ?c= from URL via replaceState, keeps other params', () => {
    const cipher = '50-V01P02';
    const loc = makeLocation({ search: '?src=twa-apk&c=' + encodeURIComponent(cipher) });
    const hist = makeHistory();
    consumeDeepLink(loc, hist);
    assert.equal(hist.calls.length, 1);
    assert.ok(hist.calls[0].includes('src=twa-apk'), 'other params preserved');
    assert.ok(!hist.calls[0].includes('&c=') && !hist.calls[0].includes('?c='), '?c= removed');
});

test('consumeDeepLink: removes ?c= leaving clean URL when it was the only param', () => {
    const loc = makeLocation({ search: '?c=' + encodeURIComponent('50-V01P02') });
    const hist = makeHistory();
    consumeDeepLink(loc, hist);
    assert.equal(hist.calls[0], '/pwa/index.html');
});

test('consumeDeepLink: decodes special characters in ciphertext', () => {
    const cipher = '50-#0b54835392^C-~20-#7b8794-~3f';
    const loc = makeLocation({ search: '?c=' + encodeURIComponent(cipher) });
    const hist = makeHistory();
    assert.equal(consumeDeepLink(loc, hist), cipher);
});

test('consumeDeepLink: returns null for malformed percent-encoding', () => {
    const loc = makeLocation({ search: '?c=%ZZ' });
    const hist = makeHistory();
    assert.equal(consumeDeepLink(loc, hist), null);
});

test('consumeDeepLink: preserves hash when clearing ?c=', () => {
    const loc = makeLocation({ search: '?c=50-V01P02', hash: '#section' });
    const hist = makeHistory();
    consumeDeepLink(loc, hist);
    assert.equal(hist.calls[0], '/pwa/index.html#section');
});

// ---------- buildDeepLink tests ----------

test('buildDeepLink: produces ?c= query param URL (not #c= fragment)', () => {
    const cipher = '50-V01P02-~20-V01P03';
    const url = buildDeepLink('https://example.github.io', '/pwa/index.html', '', cipher);
    assert.ok(url.includes('?c='), 'URL contains ?c=');
    assert.ok(!url.includes('#c='), 'URL does not use fragment');
    const params = new URL(url).searchParams;
    assert.equal(params.get('c'), cipher);
});

test('buildDeepLink: merges ?c= into existing search params', () => {
    const url = buildDeepLink('https://x.io', '/pwa/index.html', '?src=twa-apk', '50-V01P02');
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get('src'), 'twa-apk');
    assert.equal(parsed.searchParams.get('c'), '50-V01P02');
});

test('buildDeepLink: round-trips through consumeDeepLink correctly', () => {
    const cipher = '50-#0b54^C-~20-V09P01';
    const url = buildDeepLink('https://x.io', '/pwa/index.html', '', cipher);
    const parsed = new URL(url);
    const loc = makeLocation({ search: parsed.search, pathname: parsed.pathname });
    const result = consumeDeepLink(loc, makeHistory());
    assert.equal(result, cipher);
});

// ---------- buildSendMessageBody / reply_markup tests ----------

test('reply_markup: includes inline_keyboard with Descifrar button', () => {
    const deepLink = buildDeepLink('https://x.io', '/pwa/index.html', '', '50-V01P02');
    const body = buildSendMessageBody('50-V01P02', '123456', deepLink);
    assert.ok(body.reply_markup, 'reply_markup present');
    assert.ok(Array.isArray(body.reply_markup.inline_keyboard), 'inline_keyboard is array');
    const btn = body.reply_markup.inline_keyboard[0][0];
    assert.equal(btn.text, 'Descifrar →');
    assert.ok(btn.url.includes('?c='), 'button url contains ?c=');
});

test('reply_markup: button url contains the ciphertext as encoded query param', () => {
    const cipher = '50-V01P02-~20-#7b8794';
    const deepLink = buildDeepLink('https://x.io', '/pwa/index.html', '', cipher);
    const body = buildSendMessageBody(cipher, '123', deepLink);
    const btn = body.reply_markup.inline_keyboard[0][0];
    const params = new URL(btn.url).searchParams;
    assert.equal(params.get('c'), cipher);
});

test('reply_markup: preserves ciphertext unchanged in text field', () => {
    const cipher = '50-V01P02';
    const deepLink = buildDeepLink('https://x.io', '/pwa/index.html', '', cipher);
    const body = buildSendMessageBody(cipher, '123', deepLink);
    assert.equal(body.text, cipher);
});

// ---------- chunkCipherText tests ----------

function makeCipher(nTokens, tokenWidth = 6) {
    return Array.from({ length: nTokens }, (_, i) => {
        const n = String(i + 1).padStart(2, '0');
        return `V${n}P${n}`;
    }).join('-');
}

test('chunkCipherText: short message returns single element, no prefix', () => {
    const cipher = '50-V01P02-~20-V01P03';
    const result = chunkCipherText(cipher, 4096);
    assert.equal(result.length, 1);
    assert.equal(result[0], cipher);
});

test('chunkCipherText: single chunk equals original ciphertext', () => {
    const cipher = '50-V01P02';
    assert.deepEqual(chunkCipherText(cipher, 4096), [cipher]);
});

test('chunkCipherText: message exactly at limit stays one chunk', () => {
    const cipher = 'A'.repeat(4096);
    assert.equal(chunkCipherText(cipher, 4096).length, 1);
});

test('chunkCipherText: message one char over limit splits into two chunks', () => {
    const t1 = 'A'.repeat(92);
    const t2 = 'X';
    const result = chunkCipherText(`${t1}-${t2}`, 90);
    assert.equal(result.length, 2);
    assert.ok(result[0].startsWith('[1/2] '));
    assert.ok(result[1].startsWith('[2/2] '));
});

test('chunkCipherText: all chunks fit within maxLen', () => {
    const cipher = makeCipher(200, 6);
    const result = chunkCipherText(cipher, 200);
    for (const chunk of result) {
        assert.ok(chunk.length <= 200, `chunk too long: ${chunk.length}`);
    }
});

test('chunkCipherText: chunks reassemble to original ciphertext', () => {
    const cipher = makeCipher(100, 6);
    const result = chunkCipherText(cipher, 100);
    assert.ok(result.length > 1);
    const stripped = result.map(c => c.replace(/^\[\d+\/\d+\] /, ''));
    assert.equal(stripped.join('-'), cipher);
});

test('chunkCipherText: chunks are numbered sequentially', () => {
    const cipher = makeCipher(100, 6);
    const result = chunkCipherText(cipher, 100);
    const n = result.length;
    result.forEach((chunk, i) => {
        assert.ok(chunk.startsWith(`[${i + 1}/${n}] `));
    });
});

test('chunkCipherText: no chunk splits a token in the middle', () => {
    const cipher = makeCipher(50, 6);
    const result = chunkCipherText(cipher, 80);
    for (const chunk of result) {
        const body = chunk.replace(/^\[\d+\/\d+\] /, '');
        assert.ok(!body.startsWith('-'));
        assert.ok(!body.endsWith('-'));
    }
});

test('chunkCipherText: empty string returns single empty chunk', () => {
    const result = chunkCipherText('', 4096);
    assert.equal(result.length, 1);
    assert.equal(result[0], '');
});
