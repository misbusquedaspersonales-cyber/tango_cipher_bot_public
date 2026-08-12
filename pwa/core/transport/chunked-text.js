/**
 * core/transport/chunked-text.js
 *
 * Strategy #1: split the ciphertext across one or more Telegram text
 * messages (sendMessage), each ≤4096 chars, cut only on token boundaries
 * (the `-` separator in the wire format — see chunkCipherText below).
 *
 * The "Descifrar →" button on the last chunk embeds the full ciphertext
 * in a ?c= query param — but only when the resulting URL fits Telegram's
 * 2048-byte button-URL limit. Above that, the button opens the app
 * without pre-loading and the receiver must copy each chunk, strip its
 * `[i/N]` prefix, and reassemble by hand.
 *
 * KNOWN LIMITATION (see ROADMAP.md, Fase 10.1): that manual-reassembly
 * path has no supporting UI or parser — it's a real dead end above ~1200
 * ciphertext chars. This is exactly why strategy #2 (document.js) exists.
 * core/transport/index.js's selectTransport() is responsible for routing
 * around this limitation — this module does not protect against it itself,
 * so do not call chunkedTextTransport.send() directly for long ciphertexts;
 * always go through sendCiphertext() in index.js.
 *
 * Paired receive-side resolver: core/receive/from-query-param.js
 * (that module reads the ?c= this one writes — if the wire format of the
 * deep-link URL changes here, update it there too).
 *
 * DOM-free except for `fetch`, which is injectable via ctx.fetchFn for
 * testing — same pattern as the rest of core/.
 */

import { TELEGRAM_TEXT_MAX, TELEGRAM_BUTTON_URL_MAX } from "./types.js";

const PREFIX_RESERVE = 8; // worst case "[99/99] " — real messages won't reach 99 chunks, but this keeps the function correct for any input without a second pass

/**
 * Splits a ciphertext string into chunks that fit within maxLen characters,
 * cutting only on token boundaries (the `-` separator in the wire format).
 * Each chunk beyond the first is prefixed with `[i/N] ` so the receiver
 * (in principle) knows how many parts to expect.
 *
 * @param {string} codigo - full ciphertext (e.g. "50-V01P02-~20-V01P03-…")
 * @param {number} [maxLen]
 * @returns {string[]} array of chunk strings, length >= 1
 */
export function chunkCipherText(codigo, maxLen = TELEGRAM_TEXT_MAX) {
    // Fast path: fits in one message — no prefix needed, no split.
    if (codigo.length <= maxLen) return [codigo];

    const tokens = codigo.split("-");
    const effectiveMax = maxLen - PREFIX_RESERVE;

    const rawChunks = [];
    let current = [];
    let currentLen = 0; // length of current.join("-")

    for (const token of tokens) {
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
 * Builds the deep-link URL this strategy's button points to. Exported so
 * core/transport/index.js can measure its length when deciding whether
 * this strategy is viable at all for a given ciphertext.
 *
 * Uses a query parameter (?c=) rather than a URL fragment (#c=) because
 * Telegram's Android client strips URL fragments before passing URLs to
 * the intent system — the fragment never reaches the app. Query
 * parameters survive this handling intact.
 *
 * @param {string} origin
 * @param {string} pathname
 * @param {string} search
 * @param {string} ciphertext
 * @returns {string}
 */
export function buildDeepLink(origin, pathname, search, ciphertext) {
    const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    params.set("c", ciphertext);
    return `${origin}${pathname}?${params.toString()}`;
}

function buildSendMessageBody(text, chatId, deepLink) {
    const body = { chat_id: chatId, text };
    if (deepLink) {
        body.reply_markup = { inline_keyboard: [[{ text: "Descifrar →", url: deepLink }]] };
    }
    return body;
}

async function describeError(resp) {
    try {
        const data = await resp.json();
        return data.description ? ` (${data.description})` : "";
    } catch {
        return "";
    }
}

/** @type {import("./types.js").Transport} */
export const chunkedTextTransport = {
    async send(ciphertext, ctx) {
        const { botToken, chatId, origin, pathname, search, fetchFn = fetch } = ctx;
        const chunks = chunkCipherText(ciphertext, TELEGRAM_TEXT_MAX);
        const apiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;

        const deepLink = buildDeepLink(origin, pathname, search, ciphertext);
        const useDeepLink = deepLink.length <= TELEGRAM_BUTTON_URL_MAX;

        for (let i = 0; i < chunks.length; i++) {
            const isLast = i === chunks.length - 1;
            let body;
            if (isLast && useDeepLink) {
                body = buildSendMessageBody(chunks[i], chatId, deepLink);
            } else if (isLast) {
                body = buildSendMessageBody(chunks[i], chatId, `${origin}${pathname}`);
            } else {
                body = buildSendMessageBody(chunks[i], chatId, null);
            }

            const resp = await fetchFn(apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            if (!resp.ok) {
                const detalle = await describeError(resp);
                throw new Error(`Error al enviar a Telegram${detalle} (parte ${i + 1}/${chunks.length}).`);
            }
        }

        return { deepLinkCapable: useDeepLink, partsSent: chunks.length };
    },
};
