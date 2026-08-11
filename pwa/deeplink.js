/**
 * deeplink.js
 *
 * DOM-free helpers for the deep-link send/receive circuit (Fase 7.1).
 * Extracted from app.js so that deeplink.test.mjs can import the real
 * implementations instead of maintaining inline copies (TO_FIX.md F-6).
 *
 * Nothing in this module touches document, window, fetch, or IndexedDB —
 * only location and history, both injectable for testing.
 *
 * Exports:
 *   consumeDeepLink(loc?, hist?)  → string | null
 *   buildDeepLink(origin, pathname, search, ciphertext) → string
 *   buildSendMessageBody(mensajeCifrado, chatId, deepLink) → object
 */

/**
 * Reads and immediately clears the URL fragment so the ciphertext doesn't
 * stay visible in the address bar, doesn't re-trigger on refresh, and
 * doesn't appear in the browser history entry for this page.
 *
 * @param {Location} loc   - injectable for testing; defaults to window.location
 * @param {History}  hist  - injectable for testing; defaults to window.history
 * @returns {string|null} decoded ciphertext, or null if no #c= deep link present
 */
export function consumeDeepLink(loc = location, hist = history) {
    const hash = loc.hash;
    if (!hash.startsWith("#c=")) return null;

    // Clear the fragment immediately — before any async work — so it's gone
    // even if vault unlock takes a few seconds.
    hist.replaceState(null, "", loc.pathname + loc.search);

    try {
        return decodeURIComponent(hash.slice(3)); // strip "#c="
    } catch {
        // Malformed percent-encoding — treat as no deep link rather than crash.
        return null;
    }
}

/**
 * Builds the deep-link URL that the "Descifrar →" button points to.
 * Uses origin + pathname so it works on GitHub Pages and any local dev server.
 * The ciphertext goes in the fragment (#c=) so it never appears in server
 * logs or Referer headers.
 *
 * @param {string} origin     - e.g. "https://user.github.io"
 * @param {string} pathname   - e.g. "/repo/pwa/index.html"
 * @param {string} search     - e.g. "" or "?src=twa-apk"
 * @param {string} ciphertext - the raw ciphertext string (will be encoded)
 * @returns {string} full URL with #c=<encoded ciphertext>
 */
export function buildDeepLink(origin, pathname, search, ciphertext) {
    return `${origin}${pathname}${search}#c=${encodeURIComponent(ciphertext)}`;
}

/**
 * Splits a ciphertext string into chunks that fit within maxLen characters,
 * cutting only on token boundaries (the `-` separator in the wire format).
 * Each chunk is prefixed with `[i/N] ` so the receiver knows how many parts
 * to expect. The deep-link button ("Descifrar →") is only attached to the
 * last chunk — it carries the full ciphertext in its fragment so decryption
 * works in one tap regardless of how many parts were sent.
 *
 * Cutting on token boundaries (not mid-character) is important because:
 *   - It prevents the receiver from confusing a partial chunk with a valid
 *     (but wrong) ciphertext and getting a misleading decrypt error.
 *   - The token grammar uses `-` exclusively as a separator, never inside a
 *     token, so splitting there is always safe.
 *
 * @param {string} codigo  - full ciphertext (e.g. "50-V01P02-~20-V01P03-…")
 * @param {number} maxLen  - maximum characters per chunk including the prefix
 * @returns {string[]}     - array of prefixed chunk strings, length >= 1
 */
export function chunkCipherText(codigo, maxLen = 4096) {
    // Fast path: fits in one message — no prefix needed, no split.
    if (codigo.length <= maxLen) return [codigo];

    // Split into tokens on the `-` separator.
    const tokens = codigo.split("-");

    // First pass: group tokens into raw chunks (without prefix yet).
    // We'll add the prefix in a second pass once we know N, because the
    // prefix length "[10/10] " depends on the total chunk count.
    // To be safe we reserve prefix room upfront using the worst-case width
    // "[99/99] " = 8 chars. Real messages will never reach 99 chunks, but
    // this keeps the function correct for any input without two passes.
    const PREFIX_RESERVE = 8; // "[99/99] "
    const effectiveMax = maxLen - PREFIX_RESERVE;

    const rawChunks = [];
    let current = [];
    let currentLen = 0; // length of current.join("-")

    for (const token of tokens) {
        // Length this token would add: token itself + separator before it (if not first)
        const addLen = current.length === 0 ? token.length : 1 + token.length;
        if (current.length > 0 && currentLen + addLen > effectiveMax) {
            rawChunks.push(current.join("-"));
            current = [token];
            currentLen = token.length;
        } else {
            current.push(token);
            currentLen += addLen;
        }
    }
    if (current.length > 0) rawChunks.push(current.join("-"));

    const n = rawChunks.length;
    return rawChunks.map((chunk, i) => `[${i + 1}/${n}] ${chunk}`);
}

/**
 * inline_keyboard button that lets the receiver open the deep link.
 *
 * Using a url button in reply_markup (rather than a bare URL in the message
 * text) prevents Telegram's servers from fetching the URL for link preview,
 * which would expose the ciphertext to Telegram's infrastructure.
 *
 * @param {string} mensajeCifrado - ciphertext to send as message text
 * @param {string} chatId         - Telegram chat_id
 * @param {string} deepLink       - full deep-link URL (from buildDeepLink)
 * @returns {object} body suitable for JSON.stringify and POST to sendMessage
 */
export function buildSendMessageBody(mensajeCifrado, chatId, deepLink) {
    return {
        chat_id: chatId,
        text: mensajeCifrado,
        reply_markup: {
            inline_keyboard: [[
                { text: "Descifrar →", url: deepLink }
            ]]
        }
    };
}
