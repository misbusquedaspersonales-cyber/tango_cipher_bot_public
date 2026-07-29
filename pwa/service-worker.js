/**
 * service-worker.js
 *
 * Two caching strategies, deliberately different:
 *
 *  - APP SHELL (html/js/fonts/icons/manifest): cache-first. This code only
 *    changes when you redeploy the PWA, so once it's cached there's no
 *    reason to hit the network for it — instant load, works offline.
 *
 *  - encrypted-bundle.json: network-first, falling back to cache. This file
 *    changes whenever the corpus (tangos.json) is updated in CI, and the
 *    whole point of Fase 3 is that a fresh bundle can ship without a code
 *    change. Cache-first here would silently pin a device to a stale
 *    corpus. Network-first means: use the latest when online, still work
 *    (with whatever was last downloaded) when offline.
 *
 * Bump CACHE_VERSION whenever the shell file list changes, so old caches
 * get cleaned up on activate instead of accumulating forever.
 */

const CACHE_VERSION = "tango-cifrado-v4";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const BUNDLE_CACHE = `${CACHE_VERSION}-bundle`;

const SHELL_FILES = [
    "./",
    "./index.html",
    "./app.js",
    "./cipherEngine.js",
    "./secure-vault.js",
    "./manifest.json",
    "./fonts/IBMPlexMono-Regular.ttf",
    "./fonts/IBMPlexMono-Bold.ttf",
    "./icons/icon-192.png",
    "./icons/icon-512.png",
    "./icons/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(SHELL_CACHE)
            .then((cache) =>
                Promise.all(
                    SHELL_FILES.map((url) =>
                        fetch(url, { cache: "reload" }).then((response) => cache.put(url, response))
                    )
                )
            )
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => key !== SHELL_CACHE && key !== BUNDLE_CACHE)
                    .map((key) => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

function isBundleRequest(url) {
    return url.pathname.endsWith("encrypted-bundle.json");
}

self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);

    // Never intercept calls to the Telegram API — those must always hit
    // the network live, and failures there are handled by app.js/telegram
    // client logic, not the service worker.
    if (url.hostname === "api.telegram.org") return;

    if (event.request.method !== "GET") return;

    if (isBundleRequest(url)) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    const copy = response.clone();
                    caches.open(BUNDLE_CACHE).then((cache) => cache.put(event.request, copy));
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    if (SHELL_FILES.some((f) => url.pathname.endsWith(f.replace("./", "/")))
        || url.pathname === "/" ) {
        event.respondWith(
            caches.match(event.request).then((cached) => cached || fetch(event.request))
        );
        return;
    }

    // Anything else: try network, fall back to cache if present.
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});
