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
import { consumeDeepLink, buildDeepLink, buildSendMessageBody } from '../../pwa/deeplink.js';

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
