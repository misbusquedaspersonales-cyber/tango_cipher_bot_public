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
 * Builds the JSON body for a Telegram sendMessage call, including the
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
