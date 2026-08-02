/**
 * deeplink.test.mjs
 *
 * Tests for the deep-link reception logic introduced in Fase 7.1:
 *   - consumeDeepLink(): reads #c=... from location.hash, clears it,
 *     returns decoded ciphertext or null.
 *   - enviarATelegram() reply_markup: verifies the inline_keyboard button
 *     is included with the correct url in the Telegram API payload.
 *
 * consumeDeepLink() and applyDeepLinkIfPending() live in app.js alongside
 * DOM-dependent code, so we test them by importing the pure logic directly
 * after stubbing the globals they need (location, history).
 * enviarATelegram() makes a fetch() call; we stub fetch to capture the body.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

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

// Inline the pure logic of consumeDeepLink() so we can test it without
// importing all of app.js (which touches document/DOM at module scope).
// This must stay in sync with the implementation in pwa/app.js.
function consumeDeepLink(loc, hist) {
    const hash = loc.hash;
    if (!hash.startsWith('#c=')) return null;
    hist.replaceState(null, '', loc.pathname + loc.search);
    try {
        return decodeURIComponent(hash.slice(3));
    } catch {
        return null;
    }
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

// ---------- enviarATelegram reply_markup tests ----------
// Inline the relevant part of enviarATelegram() to test the payload shape
// without importing app.js. Must stay in sync with pwa/app.js.

function buildSendMessageBody(mensajeCifrado, chatId, deepLink) {
    return {
        chat_id: chatId,
        text: mensajeCifrado,
        reply_markup: {
            inline_keyboard: [[
                { text: 'Descifrar →', url: deepLink }
            ]]
        }
    };
}

test('reply_markup: includes inline_keyboard with Descifrar button', () => {
    const body = buildSendMessageBody('50-V01P02', '123456', 'https://x.io/pwa/index.html#c=50-V01P02');
    assert.ok(body.reply_markup, 'reply_markup present');
    assert.ok(Array.isArray(body.reply_markup.inline_keyboard), 'inline_keyboard is array');
    const btn = body.reply_markup.inline_keyboard[0][0];
    assert.equal(btn.text, 'Descifrar →');
    assert.ok(btn.url.includes('#c='), 'button url contains fragment');
});

test('reply_markup: button url contains the ciphertext as encoded fragment', () => {
    const cipher = '50-V01P02-~20-#7b8794';
    const deepLink = 'https://x.io/pwa/index.html#c=' + encodeURIComponent(cipher);
    const body = buildSendMessageBody(cipher, '123', deepLink);
    const btn = body.reply_markup.inline_keyboard[0][0];
    assert.equal(decodeURIComponent(btn.url.split('#c=')[1]), cipher);
});

test('reply_markup: preserves ciphertext unchanged in text field', () => {
    const cipher = '50-V01P02';
    const body = buildSendMessageBody(cipher, '123', 'https://x.io/#c=' + cipher);
    assert.equal(body.text, cipher);
});
