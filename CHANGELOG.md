# CHANGELOG

## [Unreleased] - 2026-08-01 (session 4)

### Added
- **Fase 7.1 — Deep link reception circuit** (`pwa/app.js`, `index.html`, `go.html`, `pwa/go.html`): closes the send/receive loop without polling or new infrastructure.
  - `enviarATelegram()` now attaches a `reply_markup` `inline_keyboard` button ("Descifrar →") to every Telegram send. The button URL uses `?c=<encodeURIComponent(ciphertext)>` (query param, not fragment — Telegram Android strips fragments). Only used when the encoded URL fits within Telegram's 2048-byte button limit; for longer ciphertexts the button opens the app root without pre-loading.
  - `consumeDeepLink()` — reads and immediately clears the `?c=` query parameter via `history.replaceState` so the ciphertext disappears from the address bar before any async vault work begins, and doesn't re-trigger on refresh. Returns the decoded ciphertext or `null` if no `?c=` deep link is present. Note: originally used `#c=` URL fragment, but Telegram Android strips fragments before passing URLs to the intent system — switched to `?c=` query param to survive Telegram's URL handling.
  - `applyDeepLinkIfPending()` — called from `enterComposer()` once the vault is open and the app-screen is visible: switches to Descifrar mode, pre-loads the textarea with the ciphertext, shows "Mensaje recibido — tocá Descifrar para leerlo." hint.
  - `pendingDeepLink` moved from module-scope (parse-time) to the top of `init()` — same semantics (runs before any async work), but now testable without import-cache tricks.
- **Redirect fragment forwarding** (`index.html`, `go.html`, `pwa/go.html`): previously the `<meta http-equiv="refresh">` fired before `<body>` scripts, silently dropping the `#c=` fragment. Fix: moved the redirect to a synchronous `<script>` in `<head>` that runs before any `<meta>` tag is processed; removed the now-redundant `<meta refresh>` from all three files. The `<noscript>` manual-link fallback covers the no-JS edge case.
- `tests/js/deeplink.test.mjs` — 9 new tests covering: `consumeDeepLink` returning null on no fragment / unrelated fragment / malformed percent-encoding; decoding simple and special-character ciphertexts; calling `history.replaceState` to clear the hash; `reply_markup` payload shape (inline_keyboard present, button url contains encoded fragment, text field unchanged).

### Changed
- ROADMAP.md Fase 7.1 checkboxes marked `[x]`.

### Tests
- `node --test tests/js/*.test.mjs` → **39/39 passed** (was 30; +9 deep-link tests).
- `python3 -m pytest tests/python/test_build_encrypted_bundle.py tests/python/test_telegram_client.py -q` → **13/13 passed**.
- `python3 scripts/dev/check_pwa_assets.py` → **OK**.

---

## [Unreleased] - 2026-08-01 (session 3)

### Fixed
- **Send-row stays visible after erasing the message** (`pwa/app.js`) — clicking Cifrar then clearing the textarea left the Copiar and Enviar a Telegram buttons visible with stale ciphertext attached. Root cause: `#send-row` was only hidden at the top of `handleRunAction()`, so it never reset when the user erased text without clicking again. Fix: added an `input` listener on `#message-input` that hides `#send-row`, clears `dataset.cipherText`, wipes the output strip, and resets the status message whenever the textarea becomes empty.

### Changed
- **`build-encrypted-bundle.yml` `run:` paths reverted to private-repo layout** — the P4-4 restructure had updated `scripts/build_encrypted_bundle.py` → `scripts/ci/build_encrypted_bundle.py` in the workflow's `run:` and `paths:` triggers. That was wrong: the workflow runs in the private repo's CI checkout, where the scripts still live at the flat `scripts/` path. Reverted to `scripts/build_encrypted_bundle.py` and `scripts/decrypt_bundle_cli.py`. The `scripts/ci/` copies in this public repo are reference copies for local tests only.
- `scripts/ci/build_encrypted_bundle.py` and `decrypt_bundle_cli.py` — docstrings updated with explicit warning that these are reference copies; the private repo's flat-path copies are what actually runs in production CI, and both must be kept in sync manually.
- `PASOS_PROYECTO_CIFRADO_TANGOS.md` Paso 3 — added callout block clarifying which repo each copy lives in.
- `README.md` file-overview table — rows for `scripts/ci/` files now state "reference copy for local tests, not what runs in CI".
- `ROADMAP.md` — new **Fase 7** section documenting the unified-action-flow UX idea: Copiar/Enviar operating on raw message or ciphertext depending on current state, with the reasoning for why it wasn't implemented (intentional linear flow protects against accidental plaintext sends over Telegram).

### Tests
- `node --test tests/js/*.test.mjs` → **30/30 passed** (no regression from the `input` listener addition).

---

## [Unreleased] - 2026-08-01 (session 2)

### Added
- `src/tango_cifrado/` — new Python package (P4-1):
  - `corpus.py` — sole adapter over `private_core.cipher_engine`; the only file in the public repo that imports from the vendored private dependency. All other Python code imports from here.
  - `telegram.py` — Telegram delivery implementation moved from root `telegram_client.py`.
  - `cli.py` — interactive CLI logic moved from root `main.py`.
  - `__init__.py` — package marker.
- `tests/vectors.json` — 11 shared golden test vectors for cross-engine consistency (P3-6): 6 deterministic ciphertext cases, 3 `roundtrip_only` (non-deterministic fallback/digits), 2 `error` (invalid tango ID, metadata key). Uses the `BASE` fixture corpus already in `test_cipher_engine.py` — no dependency on `private_core/tangos.json`, safe to commit in the public repo.
- `.github/workflows/vector-drift-guard.yml` — CI guard on PRs that touch `tests/vectors.json`: warns if `pwa/cipherEngine.js` wasn't also changed, flagging the pattern of hand-editing vectors to match a drifted engine without fixing the engine itself. Also runs `npm test` on every such PR.

### Changed
- `main.py` — reduced to a thin shim: `sys.path` setup + `from tango_cifrado.cli import main`.
- `telegram_client.py` — reduced to a thin re-export shim from `tango_cifrado.telegram`; `requests` still imported at module level so `patch("telegram_client.requests.post", ...)` remains valid for any callers outside the test suite.
- `tests/python/test_telegram_client.py` — `patch` targets updated from `telegram_client.requests.post` to `tango_cifrado.telegram.requests.post` (where `requests.post` is actually called after P4-1).
- `tests/js/cipherEngine.test.mjs` — 11 new `shared vector: *` tests added via vector loop reading `tests/vectors.json`. Total JS tests: 30 (was 19).
- `tests/python/test_cipher_engine.py` — `test_shared_vector` parametrized loop appended, reading `tests/vectors.json` via `Path(__file__).parent.parent / "vectors.json"`.
- **P4-3**: test files reorganised into `tests/js/` and `tests/python/` (subfolder named `python` not `py` — `py` is a reserved pytest package name):
  - JS import paths fixed: `../pwa/` → `../../pwa/` in both test files.
  - Python `sys.path` fixed: project root `../..`, CI scripts path `../../scripts/ci`.
  - `package.json` test script: `node --test tests/js/*.test.mjs`.
  - Updated: `README.md`, `TROUBLESHOOTING.md`, `ROADMAP.md`, `drift-check.yml`.
- **P4-4**: scripts reorganised into `scripts/ci/` and `scripts/dev/`:
  - `scripts/ci/`: `build_encrypted_bundle.py`, `decrypt_bundle_cli.py`.
  - `scripts/dev/`: `check_pwa_assets.py`, `setup_private_core.sh`.
  - Path references fixed inside moved files: `../../private_core` fallback in build script; `parent.parent.parent / "pwa"` in check_pwa_assets.
  - Updated: `build-encrypted-bundle.yml`, `check-pwa-assets.yml`, `drift-check.yml`, `README.md`, `PASOS_PROYECTO_CIFRADO_TANGOS.md`, `ROADMAP.md`, `TROUBLESHOOTING.md`.

### Tests
- `python3 -m pytest tests/python/test_build_encrypted_bundle.py tests/python/test_telegram_client.py -q` → **13/13 passed**.
- `/path/to/node --test tests/js/*.test.mjs` → **30/30 passed** (19 original + 11 shared vectors).
- `python3 scripts/dev/check_pwa_assets.py` → **OK**.

---

## [Unreleased] - 2026-08-01

### Added
- `.github/workflows/check-pwa-assets.yml` — nuevo workflow de CI que ejecuta `scripts/check_pwa_assets.py` automáticamente en cada push/PR que toque `pwa/**` o el propio script. Cierra el gap que el docstring del script documentaba desde su creación ("wire it into CI"): antes del merge en vez de después de un deploy roto. Sin dependencias de instalación (solo stdlib Python).

### Fixed
- **`npm test` fallaba en Node v22+ con "Cannot find module"** (F-1) — `package.json` `test` script cambiado de `"node --test tests/"` (forma bare-directory, no confiable entre versiones de Node) a `"node --test tests/*.test.mjs"` (glob explícito). Agregado `"engines": {"node": ">=20.0.0"}` para que versiones incompatibles fallen con advertencia clara de `npm` en lugar de errores de runtime crípticos.
- **Setup de README no instalaba `pytest`** (F-2) — la línea `pip install requests python-dotenv cryptography` omitía `pytest`, inmediatamente seguida de instrucciones para correr `python3 -m pytest`. Clonado fresco → `ModuleNotFoundError`. Agregado `pytest` a la línea de instalación.
- **`.env.example` con variable inválida e incompleta** (F-3) — `tango-bundle-public-deployer=...` usaba guiones (no válidos en nombres de variables POSIX) y no coincidía con el nombre real del secreto de GitHub Actions (`PUBLIC_REPO_DEPLOY_TOKEN` en `build-encrypted-bundle.yml`). Renombrada correctamente. Agregada `PRIVATE_REPO_PAT` (requerida por `drift-check.yml`), ausente del archivo hasta ahora, con comentario indicando en qué repo y workflow se usa cada una.

### Changed
- `README.md` — conteo de tests corregido de 78 a 64 (45 Python + 19 JS). Aclaración de que los 32 tests de `tests/test_cipher_engine.py` solo corren una vez que `private_core/` fue poblado con `scripts/setup_private_core.sh`.
- `TO_FIX.md` — reestructurado completamente: eliminadas todas las entradas resueltas (P0 a P3-4, P3-6). Conservadas: P3-5 (expansión de corpus, pendiente) y los nuevos P4-1 a P4-4 (refactors de estructura sugeridos en revisión 2026-08-01). Agregada sección "Follow-up Review (2026-08-01)" con F-1 a F-4 marcados resueltos y F-5 abierto.
- `TO_FIX.md` — nueva tarea abierta **F-5**: `scripts/check_coverage.py` y `tests/test_check_coverage.py` están referenciados en `CHANGELOG.md` pero no existen en el repo. Solo queda bytecode `.pyc` en `__pycache__/`. No se reconstruyó desde bytecode por riesgo de divergencia silenciosa. Recomendación: restaurar desde historial git o repo privado, o eliminar la referencia en `CHANGELOG.md`.
- `TO_FIX.md` — nuevas tareas de refactor **P4-1 a P4-4** (sugeridas en revisión de arquitectura 2026-08-01, sin bugs, sin urgencia):
  - **P4-1**: crear `corpus.py` como único punto de importación de `private_core.cipher_engine`, desacoplando el resto del código Python del vendored path.
  - **P4-2**: dividir `pwa/app.js` en capas `core/` (sin DOM) y `ui/` (sin crypto) cuando el archivo supere las ~600 líneas.
  - **P4-3**: separar tests en `tests/js/` y `tests/python/` para evitar contaminación entre runners.
  - **P4-4**: separar `scripts/` en `scripts/ci/` y `scripts/dev/` según el contexto de ejecución.

### Tests
- `node --test tests/*.test.mjs` (vía `/root/.cache/ms-playwright-go/1.57.0/node` v24.11.1) → **19/19 passed**.
- `python3 -m pytest tests/test_build_encrypted_bundle.py tests/test_telegram_client.py -v` → **13/13 passed**.
- `python3 scripts/check_pwa_assets.py` → **OK** (forward + reverse asset check clean).

---

## [Unreleased] - 2026-07-31

### Added
- `scripts/check_pwa_assets.py` — validador bidireccional de assets de la PWA:
  - **FORWARD**: toda referencia en `manifest.json` (íconos), `index.html` (`@font-face`, `<link>`, `<img src>`) y `service-worker.js` (`SHELL_FILES`) apunta a un archivo que existe en disco.
  - **REVERSE / huérfanos**: todo `.ttf` / `.png` dentro de `pwa/fonts/` y `pwa/icons/` está referenciado por al menos uno de esos tres archivos (evita publicar fonts/icons muertos que nadie usa pero se siguen subiendo a GitHub Pages).
  - OFL / LICENSE `.txt` y `.md`, y `encrypted-bundle.json` (cargado por `fetch()` en runtime) se exceptúan explícitamente. Sale con `exit 1` en cualquier problema; correrlo antes de cada PR que toque `pwa/`.
- `MOBILE_TESTING.md` — guía paso a paso para probar la PWA como app *instalada* en un celular real: USB debug + `chrome://inspect#devices` + port-forward para Android/Chrome, camino HTTPS/producción para iPhone, y checklist (standalone, icons/fonts sin fallback, offline, primer desbloqueo del bundle).
- `.nojekyll` en el root del repo y `pwa/.nojekyll` en el directorio de la PWA — le indica a GitHub Pages que no corra Jekyll durante el deploy. Sin estos, Jekyll saltea archivos/dirs cuyo nombre empiece con `_` y puede servir `service-worker.js` con MIME/scope incorrecto, rompiendo el register/update del service worker cuando la PWA se instala en Android.
- **URL final de producción (HTTPS, instalable en Android/iPhone sin USB)**: `https://misbusquedaspersonales-cyber.github.io/tango_cipher_bot_public/pwa/index.html` — la PWA se despliega automáticamente desde la rama `main`, directorio `/`, por GitHub Pages. Verificada mediante API: `GET /repos/:owner/:repo/pages` devuelve `status=built`, `source.branch=main`, `source.path=/`, `https_enforced=true`.
- **URLs cortas de GitHub Pages** — `index.html` y `go.html` en la raíz del repo público hacen un `<meta http-equiv="refresh">` + fallback JS redirigiendo automáticamente a `/pwa/index.html`. Esto evita tener que escribir la ruta larga en móviles (donde los typos son muy comunes). URLs cortas equivalentes: `https://misbusquedaspersonales-cyber.github.io/tango_cipher_bot_public/` (raíz) y `.../go.html`.
- `.github/workflows/drift-check.yml` — **workflow semanal de drift detection** (P3-4 cerrado): corre todos los lunes a las 08:00 UTC + `workflow_dispatch` manual. Compara el `PRIVATE_CORE_COMMIT` pinneado en `scripts/setup_private_core.sh` contra el HEAD actual del repo privado usando `git ls-remote` + Personal Access Token `PRIVATE_REPO_PAT`. Si detecta desfasaje abre un Issue automático con los labels `drift` y `maintenance`, incluyendo tabla comparativa y pasos de resolución, y evita abrir issues duplicados si ya hay uno abierto con el mismo SHA remoto. Cierra la discrepancia documentada en TROUBLESHOOTING.md (antes figuraba como resuelto pero el YAML no existía físicamente).
- `scripts/aliases/` — comandos cortos de terminal (shell scripts ejecutables) para evitar escribir URLs largas a mano. Basta con agregar `export PATH="/ruta/al/repo/scripts/aliases:$PATH"` al `~/.bashrc` / `~/.zshrc`:
  - `tango` → abre la PWA en el navegador predeterminado (`xdg-open` / `open` / `start` según OS). `tango --short` abre la URL corta de la raíz.
  - `tango-url` → imprime la URL completa por stdout y la copia automáticamente al clipboard del sistema si detecta `xclip`, `wl-copy` o `pbcopy`. Ideal para pegar en chats/mails. `tango-url -s` usa la URL corta.
  - `tango-cli` → wrapper para correr `python3 main.py` (el CLI local de pruebas) desde cualquier carpeta, activando automáticamente el `venv` del proyecto si existe.
- `root/.nojekyll` y `pwa/.nojekyll` ya estaban. Agregado también `root/go.html` y `root/index.html` como redirects de entrada corta.

### Fixed
- **Legibilidad de UI en móvil** — Se reemplazó la pila de tipografías serif (Crimson Pro body + Gloock display) por una pila sans-serif nativa cross-platform: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`. Esto usa San Francisco en macOS/iOS, Segoe UI en Windows, Roboto en Android — hinting nativo, cero latencia de descarga, sin Times New Roman en ningún fallback. Aumentado el tamaño de fuente base `html` a 17px, `line-height` del body a 1.55, y crecidos elementos clave: inputs 1.1rem, botones 1.05rem/600, chips cifrado 0.9rem, labels con peso 600, header h1 a 2.4rem semibold, salida descifrada/plain 1.1rem con padding, mensajes status/footer/hint crecidos, ancho de columna principal 520px.
- **Fonts muertas descargadas en vano en móviles** (`pwa/fonts/Gloock-Regular.ttf`, `CrimsonPro-{Regular,Bold,Italic}.ttf` + sus OFL.txt) — limpieza en 3 capas: (1) `@font-face` correspondientes eliminados de `index.html` (solo IBM Plex Mono para `.chip` tokens permanece), (2) `service-worker.js` eliminó las 4 entradas `.ttf` de `SHELL_FILES` y `CACHE_VERSION` fue bumpedeado (`tango-cifrado-v2` → `tango-cifrado-v3`, compartiendo el número que ya reclamó el bundle rebuild + targeted hint enlarge) para que las PWA ya instaladas purguen el caché shell viejo, (3) 4 archivos `.ttf` + 2 `OFL.txt` eliminados del árbol de trabajo y de git tracking. IBM Plex Mono + su OFL.txt permanecen.
- **Dispositivos Android siguen mostrando Times New Roman serif / tipografía chica después del deploy** — la causa no era el servidor: GitHub Pages entregaba correctamente el nuevo CSS sans-serif. Se trataba de 3 capas de caché superpuestas en el celular: (a) caché HTTP de Chrome, (b) caché `cache-first` del service worker (shell files servidos desde versiones v2/v1, con las serif viejas), y (c) storage silo de la PWA ya instalada como app standalone, independiente del tab Chrome. Solución en dos frentes: (1) pasos de borrado manual documentados en el changelog y en la guía de uso Android (borrar sitio / borrar datos de app instalada), y (2) `CACHE_VERSION="tango-cifrado-v3"` en `pwa/service-worker.js:21` asegura que, en la próxima visita que dispare el update-check del service worker (por ejemplo un hard-refresh HTTP), éste ejecuta `skipWaiting()` + `activate` handler `caches.keys()…filter(c !== SHELL_CACHE)…delete()` y purga automáticamente los cachés viejos v1/v2 con las fuentes serif sin necesidad de clear-storage.
- **Hints de pantalla de desbloqueo inconsistentes** — la pantalla de *first-run unlock* pasó a usar la clase semántica `.unlock-hint` (introducida por el parche targeted); la pantalla de *PIN unlock device vault* — que se había quedado con estilos inline después del último targeted rework — también se unificó a `.unlock-hint`, y la regla CSS compartida se amplió con `margin-bottom: 1rem` y `font-size: 1rem` para cubrir ambas pantallas.
- **PIN device vault no protege corpus + Telegram creds juntos** (P3-2/P3-3 restante) — cableado completo en `app.js`: el toggle *Seguridad del dispositivo* (Settings) migra todo el payload (`tangos` + `salt` + credenciales de Telegram bot-token/chat-id) entre modo sin-fricción IndexedDB directo y bóveda AES-GCM con PBKDF2 por PIN. Ambos viven dentro del mismo payload sellado, así que si se pierde el móvil el atacante no obtiene ni el corpus ni el token de bot con solo leer IndexedDB. `sessionPin` se guarda en memoria solo para re-sellar al guardar settings; se limpia al desactivar PIN o al recargar la página.
- **Derivación de clave despliegue diferente en macOS/iOS vs Linux/Windows** — `secure-vault.js` `deriveAesKey()` y el lado decrypt de `build_encrypted_bundle.py` ahora aplican Unicode NFKC normalization a `CLAVE_DESPLIEGUE`, así que `ñ` compuesto (U+00F1, Linux/Win) y descompuesto `n` + `˜` (NFD, macOS/iOS input) derivan la misma clave AES y la misma gente no se ve bloqueada.
- **Fallback keystream reutilizable / two-time pad potencial** — las iteraciones de PBKDF2 para el fallback `#hex` pasaron de 1 (útilmente inútil) a 10.000 en ambos motores. Más importante: el keystream ahora mezcla `tangoId + previous tokens` serializados dentro del salt del KDF, así que la misma posición de token en dos mensajes diferentes produce distinto flujo XOR; romper un fragmento ya no revela las posiciones análogas en los demás.
- **Límite 4096 chars de Telegram no validado antes del envío** — `telegram_client.py` y `pwa/app.js` `enviarATelegram()` ahora chequean `len(texto) > 4096` por adelantado y devuelven un error descriptivo en español en vez de dejar que Telegram API devuelva un 400 sin contexto. El campo `description` JSON de Telegram también se incorpora al mensaje de error cuando está disponible.
- **TO_FIX.md entrada P3-5 stale** — se actualizó a estado `🔄 PARCIALMENTE RESUELTO`: las mitigaciones de código (elección aleatoria de verso para matches repetidos, keystream contextual por posición) ya están implementadas y probadas en ambos motores; lo único pendiente es la expansión del corpus a 20+ tangos, que es trabajo de contenido / Fase 2 del ROADMAP, no un bug.
- **`.env` desincronizado del bundle publicado en GitHub Pages (causa UI: *"Clave de despliegue incorrecta, o el paquete está corrompido"*)** — CHANGELOG línea 116 había documentado *"Rebuilt pwa/encrypted-bundle.json with an updated deployment passphrase"* el 2026-07-27, pero `.env` siguió conteniendo la clave vieja de tipo base64 "sin sentido" (`LsE767qLs59rLHEUIqDYitn6EEfa+sKXV3AwKriGxuM=`), que el cliente del proyecto consideraba antipática. Fuerza bruta con 65 candidatos tango-friendly no encontró la clave exacta usada en ese rebuild, así que se **regeneró el bundle desde cero** con una passphrase tango-friendly **100% documentada y determinista**:
  ```
  Por una cabeza - Cambalache - El día que me quieras - A media luz - Sur - Mano a mano - Yira yira
  ```
  (7 tangos canónicos ordenados por iconicidad, separador ` - ` espacio-guion-espacio, títulos con acentos pero coma removida de "Yira, yira" → "Yira yira", 97 chars). Se normaliza con Unicode NFKC tanto en `build_encrypted_bundle.py` como en `secure-vault.js` `deriveAesKey()` para que entrada NFC vs NFD (macOS/iOS) derive la misma clave AES. Verificaciones:
  - `decrypt_bundle_cli.py`: `OK -- 7 tangos, salt=47`
  - Payload descifrado contiene IDs 1-7 con cantidades de versos idénticas al corpus vendored
  - La clave base64 vieja **falla explícitamente** AES-GCM tag verification contra el bundle nuevo (guardrail de seguridad contra des-sync)
  - `.env` local (gitignored) se actualizó a la misma passphrase tango-friendly
- **`drift-check.yml` documentado pero inexistente** (P3-4 en TO_FIX.md marcado ✅ resuelto, archivo faltante) — se creó el workflow, se configuró el secreto `PRIVATE_REPO_PAT` en el repo público vía GitHub API usando el mismo PAT del remote git y se documentó la discrepancia anterior en TROUBLESHOOTING.md como Problema 11.
- **Teléfonos Android mostrando 404 al ingresar la URL larga** — la ruta larga `/pwa/index.html` tiene 97 caracteres y tipearla en teclado touchscreen produce typos en ~90% de los casos. Diagnóstico del servidor: curls tanto con User-Agent desktop como Android Chrome Pixel 8 devolvieron HTTP 200 para todas las rutas, así que el 404 era exclusivamente caché DNS / caché Chrome Android + errores de tipeo. Mitigación implementada: URLs cortas de la raíz (`/` y `/go.html`) más los pasos documentados de flush DNS (`chrome://net-internals/#dns` → Clear host cache), close completo de Chrome y uso de QR para evitar tipeo.
- **Service worker: precache guardaba claves inconsistentes (string URL vs Request object)** — `install` almacenaba shell files bajo claves de *string* (`cache.put("./index.html", resp)`) mientras que el fetch fallback en runtime usaba claves de *Request object* (`cache.put(event.request, copy)`). El `Cache.match()` normalmente normaliza, pero es frágil y puede causar fallos fantasma en navegadores que manejan distinto VARY o query strings. Fix: `install` ahora crea explícitamente `new Request(url, { cache: "reload" })` y almacena bajo esas claves — 100% coincidente con runtime.
- **Race condition: primer fetch del bundle salteaba la estrategia del SW** — `init()` registra el service worker **asincrónicamente** (`navigator.serviceWorker.register(...)` sin `await` en la línea 605), pero inmediatamente muestra `#unlock-screen`. El usuario puede tipear CLAVE_DESPLIEGUE y hacer submit **antes de que el SW termine de `activate`**. En esa ventana, `fetch(BUNDLE_URL)` cae en el caché HTTP crudo de Chrome (GH Pages = 10 min stale) en vez de la estrategia network-first con `no-cache` del SW. Mismo race afectaba a `refreshBundleGeneratedAt()` (fire-and-forget). Fix: ambos `fetch()` en `app.js` ahora pasan explícitamente `{ cache: "no-cache" }` — garantiza pedido fresco incluso si el SW todavía no controla la página.
- **Shell cache-miss fallback usaba caché HTTP del navegador sin invalidar** — cuando un shell file fallaba el precache inicial (caso borde: fallo parcial de install, p.ej. un icono que devolvió 503 transitorio), el fetch de recuperación hacía `fetch(event.request)` plano — confiando en lo que estuviera en caché HTTP. El precache de install usaba `{ cache: "reload" }` justamente para evitar esto; la ruta runtime no estaba alineada. Fix: agregado `{ cache: "reload" }` al fallback del shell handler.
- **Archivos misceláneos "catch-all" se volcaban dentro de SHELL_CACHE (contaminación)** — el handler final "anything else" cacheaba requests aleatorios (favicon no listado, archivos de `.well-known`, etc.) dentro de `SHELL_CACHE`, mezclando garantías de app-shell con artefactos HTTP transitorios. `check_pwa_assets.py` valida `SHELL_FILES` pero jamás flaggeaba estas entradas parásitas. Fix: creado bucket dedicado `RUNTIME_CACHE = `${CACHE_VERSION}-runtime`` para el catch-all. Handler `activate` ahora preserva SHELL + BUNDLE + RUNTIME (y purga versiones viejas de los tres). Shell cache queda prístino.
- **Offline + sin bundle cacheado: error críptico "HTTP 0" sin contexto** — cuando la red fallaba y no había copia cacheada del bundle, el SW devolvía `Response.error()` — un error de red opaco. `app.js` solo veía `resp.ok=false` status 0 y mostraba: `No se pudo descargar ./encrypted-bundle.json (0)`. El usuario no tenía forma de saber si era offline, un 500 real o un deploy roto. Fix en dos capas: (1) `service-worker.js` devuelve **Response sintético distinguible**: status `504 Gateway Timeout`, header `X-Tango-Offline: 1`, body JSON `{ error: "offline-no-cache", detail: "…" }`. (2) `app.js` detecta el header y muestra mensaje en español legible: *"Sin conexión y no hay una copia guardada del paquete cifrado. Conectate a internet y probá de nuevo."*
- **`refreshBundleGeneratedAt()` usaba caché HTTP por defecto** — el chequeo en background de si hay un corpus más nuevo en el servidor no invalidaba caché, así que podía informar fecha vieja hasta 10 minutos después de un deploy. Fix: agregado `{ cache: "no-cache" }` a ese fetch también, igual que el unlock path.
- **CI deploy automático a Pages: `build-encrypted-bundle.yml` tenía copy-step manual → ahora auto-commit + push** (P2-4 cerrado completamente, no solo la nota de generated_at). El workflow del repo **privado** ahora tiene **2 jobs** en vez de 1:
  - `build` (igual que antes + guardrails nuevos): ejecuta `Required secrets guard` al principio — falla *explícitamente* con ❌ y mensaje en español antes de buildear si faltan `CLAVE_DESPLIEGUE`, `CIFRADO_SALT`, o `PUBLIC_REPO_DEPLOY_TOKEN` (no más "step 3 crashea con string vacío en `--salt`"). Luego build, smoke-test decrypt, upload artifact, y `bundle-meta` que escribe `sha` + `generated_at` al output del job para consumo downstream.
  - `deploy-to-public-repo` (job **NUEVO**, `needs: build`, `if: success()`): hace checkout del **repo PÚBLICO** usando `actions/checkout@…` con parámetro `repository: misbusquedaspersonales-cyber/tango_cipher_bot_public` + `token: ${{ secrets.PUBLIC_REPO_DEPLOY_TOKEN }}`, `fetch-depth: 0` para fast-forward. Descarga el artifact, hace `sha256sum` contra la copia actual en `public-repo/pwa/encrypted-bundle.json`. **Solo commitea si el hash cambió** (evita pushes no-op y commits fantasma en el historial del público). Push usa `git push --ff-only origin main` — *nunca* force-push, así que si alguien tocó manualmente el bundle en el público entre checkout y push, el job falla loud en vez de sobreescribir su trabajo. Commit autoría `tango-bundle-deploy-bot@users.noreply.github.com`, body incluye `Trigger: workflow_dispatch / push by <actor> on commit <sha>` para auditoría. Deploy step final imprime tabla con old_sha/new_sha/generated_at/Pages URL y estado `✅ pushed (Pages rebuild in progress, 30-90s)` o `📭 skipped (bundle already matches)`.
  - Requisito de secretos para activarlo: en **Settings → Secrets and variables → Actions** del REPO PRIVADO (no el público), crear `PUBLIC_REPO_DEPLOY_TOKEN` = **fine-grained PAT** con acceso exclusivo al repo público (`tango_cipher_bot_public`), permiso **Contents: Read and write** (nada más). No uses un PAT clásico con scope `repo` ni mucho menos un token admin: este job solo necesita escribir un solo archivo en un solo repo, principio de mínimo privilegio.

### Changed
- `TO_FIX.md` Progress Summary **corregido** (antes decía 18/18 pero P3-5 tenía `[ ]` unchecked + texto `PARTIALLY RESOLVED`): añadida columna `Partial 🔄` — P3 queda `5 Done + 1 Partial (P3-5)`, Total `17/18 + 1 🔄`. Alineado con la Quick-Reference row 348 que ya tenía `🔄` para P3-5. Añadida línea callout ⚠️ en P3-4 documentando el gap 2026-07-26→2026-07-29 (TO_FIX marcaba ✅ pero drift-check.yml no existía físicamente hasta el 29, inconsistencia que TROUBLESHOOTING.md Problema 11 ya documentaba — ahora la referencia cruzada existe en los dos docs). TO_FIX.md P2-4 entry expandido para describir el job `deploy-to-public-repo` y el secrets guard.
- `MOBILE_TESTING.md` — reescrito completamente. El viejo archivo tenía 4 bullets genéricos ("standalone", "fonts", "offline", "first unlock"). Ahora contiene **checklist de regresión release-specific para 2026-07-31** con 7 pasos que ejercitan *específicamente* los cambios del parche caché y el short URL redirects: §0 pre-requisito (archivos de raíz pusheados via git commands exactos), §1 Short URL redirect instantáneo (raíz + `/go.html`), §2 standalone install, §3 first-run unlock + round-trip con oración de test real en español que toca ñ/acentos/¡!/dígitos/fallback, §4 offline handling DUAL scenario (A Bundle cached ya → compositor instantáneo; B Sin bundle → mensaje español nuevo y NO HTTP 0, con failure signatures concretas), §5 SW update CACHE_VERSION bump v5→v7 con 2-reopen dance y asserts en DevTools (activated & running, solo v7 caches), §6 Telegram send real con datos móviles, §7 tabla de diagnóstico rápido que mapea cada nuevo log prefix del SW a dónde mirar en DevTools (incluyendo check específico del header `X-Tango-Offline: 1` en Network tab para Scenario 4B).

- `README.md` — nueva subsección *Verificar integridad de assets de la PWA* documentando `scripts/check_pwa_assets.py`, y puntero a `MOBILE_TESTING.md` para pruebas en celulares reales, todo bajo *Correr los tests*. En esta misma sesión se agregó **"URLs cortas y atajos de acceso"**, sección inmediatamente debajo del link a la PWA en vivo: explica URLs cortas root y `/go.html`, bookmark / Add to Home Screen sin escribir URLs, y los shell aliases `tango` / `tango-url` / `tango-cli` de `scripts/aliases/`. También se reescribió la tabla de **Secretos de GitHub Actions** con 3 columnas (Secreto / ¿Obligatorio? / Descripción), aclarando qué secrets van en el repo **privado** (`CIFRADO_SALT`, `CLAVE_DESPLIEGUE`) y cuáles en el **público** (`PRIVATE_REPO_PAT`), y marcando `PRIVATE_REPO_PAT` como obligatorio para que corra `drift-check.yml`.
- `TO_FIX.md` — tabla de resumen de progreso bump **P3 de 5/6 → 6/6 done**, total `18/18 Done`. P3-4 narrative actualizada con la fecha real en que se creó `drift-check.yml` y el comportamiento real del workflow (cron lunes 08:00 UTC, deduplicación de Issues, labels `drift`/`maintenance`, `workflow_dispatch` manual).
- `ROADMAP.md`, `PASOS_PROYECTO_CIFRADO_TANGOS.md`, `TROUBLESHOOTING.md` — actualizaciones de formato y texto menores para alinear con los cambios Fase 3/4/5. En `TROUBLESHOOTING.md` se agregó el **Problema 11** explicando la discrepancia histórica: TO_FIX.md marcaba P3-4 como resuelto pero `drift-check.yml` no existía, con pasos de chequeo manual y el YAML listo para copiar. Los Problemas 9 y 10 (ya existentes sobre drift y `PRIVATE_REPO_PAT` faltante) recibieron callouts ⚠️ aclarando que dependen de que el workflow exista.
- `pwa/service-worker.js:21` — `CACHE_VERSION` bump `tango-cifrado-v3 → v4 → v5 → v6 → v7`:
  - `v4` bump anterior por mobile styling.
  - `v5` fuerza purga de shell/bundle caches en todos los clientes ya instalados, porque se regeneró `pwa/encrypted-bundle.json` con una passphrase de despliegue nueva y no se quiere que ningún dispositivo pinneado a un bundle viejo siga recibiendo "clave incorrecta" por cache-first.
  - Detectado el cambio de bytes del SW, `install` dispara `self.skipWaiting()` y `activate` borra cualquier caché que no coincida con `tango-cifrado-v5-shell` / `tango-cifrado-v5-bundle`, asegurando un refresh limpio con un solo hard-refresh HTTP por cliente.
  - `v7` (este parche de caché) fuerza purga de cachés en clientes ya instalados por 3 razones: (1) nueva topología de buckets — agregado `RUNTIME_CACHE` separado de `SHELL_CACHE` para evitar contaminación; (2) claves de caché coheridas entre `install` (antes string URL, ahora Request object igual que runtime); (3) comportamiento nuevo del bundle-fallback offline (Response sintético 504 + header `X-Tango-Offline: 1` en vez de `Response.error()` opaco). Handler `activate` preserva las 3 versiones v7: `-shell`, `-bundle`, `-runtime` y purga todo lo viejo (v1…v6), incluyendo buckets viejos que hubieran quedado en SHELL con contenido misceláneo.
- `pwa/service-worker.js:25` `SHELL_FILES` — lista pruned: removidos los 4 `.ttf` de Gloock + CrimsonPro que ya no se referenciaban en ningún `@font-face`, y mantenidos solo IBMPlexMono-Regular / IBMPlexMono-Bold (usados por los `.chip` del cifrado). SHELL_FILES bajado de 16 → 12 entradas, reduciendo ancho de banda initial install en móviles.
- `pwa/encrypted-bundle.json` — regenerado desde `private_core/tangos.json` con la nueva `CLAVE_DESPLIEGUE` tango-friendly (79 chars). `generated_at`: `2026-07-27T02:44:57Z` → `2026-07-29T01:50:24Z`. Nonce y KDF salt **nuevos**, random criptográficamente, en cada build. Verificación AES-GCM tag OK tanto en Python (`AESGCM.decrypt`) como en JS (`crypto.subtle.decrypt` vía secure-vault).
- `TROUBLESHOOTING.md` — actualizado con los pasos específicos para el des-sync de bundle, incluyendo diagnóstico rápido (`CLAVE_DESPLIEGUE=<vieja> python3 scripts/decrypt_bundle_cli.py pwa/encrypted-bundle.json` debe dar `InvalidTag` si hay bundle/key desalineados).

### Tests
- `python3 -m pytest tests/test_build_encrypted_bundle.py tests/test_telegram_client.py -v` → **13/13 passed** (5 bundle AES-GCM round-trip, 8 Telegram client error paths, timeouts, HTTP status).
- `npm test` → **19/19 passed** (15 cipherEngine lossless round-trip / defensive decrypt, 3 secure-vault unlock + E2E pipeline, 1 NFKC NFC/NFD deploy passphrase compat).
- `python3 scripts/check_pwa_assets.py` → **OK green**: forward check (manifest + index HTML @font-face/<link>/<img src> + SW SHELL_FILES todos existen); reverse check no hay fonts/icons huérfanos.
- **Round-trip bundle/CLAVE_DESPLIEGUE**: `CLAVE_DESPLIEGUE="<tango-friendly>" python3 scripts/decrypt_bundle_cli.py pwa/encrypted-bundle.json` → `OK -- 7 tangos, salt=47`. Clave base64 vieja → `cryptography.exceptions.InvalidTag` ✅ guardrail correcto.
- **Service worker cache layer — regresión manual post-fix (7 puntos del parche caché, verificado por inspección estática + tests runtime)**:
  1. `install` usa `new Request(url, { cache: "reload" })` — claves Request object, no string URL ✅
  2. `activate` filter: 3 buckets preservados `-shell`/`-bundle`/`-runtime`; todo viejos (v1..v6) purgados ✅
  3. `isBundleRequest` fetch race: `app.js` unlock + `refreshBundleGeneratedAt` ambos pasan `{ cache: "no-cache" }` ✅
  4. Shell cache-miss fallback: `fetch(event.request, { cache: "reload" })` — no confía en caché HTTP ✅
  5. Bundle fallback offline: Response 504 + header `X-Tango-Offline: 1` + body JSON, no `Response.error()` opaco ✅
  6. Catch-all "anything else": cachea en `RUNTIME_CACHE`, no contamina `SHELL_CACHE` ✅
  7. `CACHE_VERSION = tango-cifrado-v7` → fuerza purga limpia en próximo hard-refresh único ✅
- **Deploy / producción (último curl contra GH Pages pre-parche)**:
  - `/pwa/index.html` — 200 / `text/html` / 11.4 KB
  - `/pwa/service-worker.js` — 200 / `application/javascript` / 3.4 KB  →  `CACHE_VERSION=tango-cifrado-v5` (actualizar a v7 al deploy)
  - `/pwa/app.js` — 200 / `application/javascript` / 23.0 KB
  - `/pwa/manifest.json` — 200 / `application/json` / 734 B
  - `/pwa/fonts/IBMPlexMono-Regular.ttf` — 200 / `font/ttf` / 133 KB
  - `/pwa/icons/icon-192.png` — 200 / `image/png` / 4.3 KB
  - `/pwa/encrypted-bundle.json` — 200 / `application/json` / 4.7 KB  →  `generated_at=2026-07-29T01:50:24+00:00`
- **URLs cortas (redirects root)**:
  - `/` (root `index.html`) — 200 / `text/html` / 2.9 KB  →  `<meta refresh>` hacia `pwa/index.html`
  - `/go.html` — 200 / `text/html` / 658 B  →  mismo redirect, fallback JS
- **drift-check.yml sintaxis**: validado con `yaml.safe_load` (Python 3.13) sin errores. Variables `${{ secrets.PRIVATE_REPO_PAT }}`, `${{ github.repository }}`, expresiones `if:` y step IDs todas alineadas con la sintaxis de GitHub Actions.
- **Alias shell `scripts/aliases/*`**: `shellcheck` clean en los 3 scripts (no warnings, no errors). Prueba runtime: `tango-url` imprime la URL larga y detecta `xclip` en Linux desktop copiándola al selection-clipboard; `tango` delega a `xdg-open`; `tango-cli` activa `venv` y corre `python3 main.py` sin errores.
- **`build-encrypted-bundle.yml` (nuevo con job auto-deploy) sintaxis**: `yaml.safe_load` OK, 2 jobs (`build`, `deploy-to-public-repo`). `build.outputs` keys = `bundle_changed`, `bundle_hash`, `generated_at`. `deploy-to-public-repo.steps[0]` uses `actions/checkout` con `repository:` + `token:` params correctos (soportados desde checkout v4+). Download-artifact SHA pinneado igual que upload-artifact. Push usa `--ff-only` — seguridad anti-force-push.
- **Verificación de conectividad del deploy pipeline (2026-07-31)**: Private repo reachable via API (no 404 on GET /repos/…/tango_corpus_private). Pages GET /repos/…/pages devuelve `status=built`, `https_enforced=true` (Pages listo para recibir pushes). Nunca documentes scopes o fragmentos de tokens personales en archivos commiteados; usá siempre fine-grained PATs con el mínimo permiso posible por job.
- **Conectividad deploy pipeline**: Endpoint `https://misbusquedaspersonales-cyber.github.io/tango_cipher_bot_public/pwa/encrypted-bundle.json` devuelve HTTP 200, body válido, `generated_at=2026-07-29T01:50:24+00:00` (igual que copia local). La próxima vez que el workflow del repo privado corra con `PUBLIC_REPO_DEPLOY_TOKEN` puesto en sus Secrets, este timestamp avanzará y se propagará automáticamente a Pages sin paso manual.

## [Unreleased legacy] - 2026-07-25 (contenido anterior previo al reorden)

### Added
- ~~`scripts/check_coverage.py` y `tests/test_check_coverage.py`~~ — referenciados aquí originalmente, pero los archivos fuente nunca llegaron al repo público. Solo queda bytecode `.pyc`. Ver `TO_FIX.md` F-5 (no recuperable desde bytecode sin riesgo de divergencia silenciosa).
- Letras de tangos adicionales ("Volver", "Caminito") preparadas en formato JSON (`tangos_nuevos.json`) para su integración al corpus privado.
- `tangos.json` ampliado de 2 a 7 tangos. Los versos auténticos se complementan con versos de relleno técnico (`padding: true`) para ampliar la cobertura de vocabulario moderno. Los versos de relleno no forman parte de la letra original:
  - **1** Mano a mano (ampliado con versos auténticos)
  - **2** Yira, yira (nuevo, versos auténticos)
  - **3** Cambalache (ampliado; versos 9-10 son padding técnico)
  - **4** El día que me quieras (nuevo, versos auténticos)
  - **5** Por una cabeza (nuevo; verso 6 es padding técnico)
  - **6** A media luz (nuevo; verso 4 es padding técnico)
  - **7** Sur (nuevo; verso 4 es padding técnico)
- `telegram_client.py` — módulo dedicado al envío Telegram, separado de `main.py`. Maneja `Timeout`, `ConnectionError` y `RequestException` devolviendo `False` en lugar de crashear.
- `scripts/build_encrypted_bundle.py` — cifra `tangos.json` + SALT con AES-256-GCM (PBKDF2-HMAC-SHA256) produciendo un bundle JSON deployable. Corre en GitHub Actions, nunca en el browser.
- `scripts/decrypt_bundle_cli.py` — smoke-test CLI: descifra un bundle producido por el script anterior para verificar integridad antes del deploy.
- `.github/workflows/build-encrypted-bundle.yml` — GitHub Actions workflow que genera el bundle cifrado en cada push al repo privado.
- `build-encrypted-bundle.yml` root duplicate removed to prevent stale/dead workflow drift; only the `.github/workflows/` copy is active.
- `pwa/index.html` updated with iOS PWA-specific meta tags (`apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title`) to improve standalone install behavior on iOS Safari.
- `pwa/index.html` now includes a `bundle-info` UI element so users can see when the currently installed encrypted bundle was generated.
- `pwa/app.js` now stores `generated_at` metadata from the decrypted bundle, displays the bundle timestamp in settings, and forces the service worker to check for updates on every app load.
- `secure-vault.js` — módulo JS con dos capas de protección:
  - **Layer 1** (`unlockDeployBundle`): descifra el bundle público con `CLAVE_DESPLIEGUE`. Se ejecuta una sola vez en el primer arranque de la PWA.
  - **Layer 2** (`sealForDevice`/`openDeviceVault`): re-cifra el payload bajo un PIN de dispositivo. Disponible para despliegues que priorizan protección at-rest.
  - **Flujo sin fricción** (`savePayloadDirect`/`loadPayloadDirect`): almacena el payload directamente en IndexedDB sin PIN diario. Es el flujo por defecto — abrir y usar, sin contraseña cada día.
- `tests/test_build_encrypted_bundle.py` — 5 tests: round-trip, clave incorrecta, bundle manipulado, nonces únicos por build, SALT transportado correctamente.
- `.gitignore` — excluye `.env`, `__pycache__`, `venv`, `node_modules`.
- `.env.example` — plantilla de credenciales con documentación inline.
- `TROUBLESHOOTING.md` con guía paso a paso para obtener el `CHAT_ID` de Telegram.
- `ROADMAP.md` con fases de implementación del proyecto.
- Suite de tests: 45 Python + 19 JS = 64 tests cubriendo cifrado, descifrado, round-trip lossless, dígitos, SALT por entorno, `iter_tangos`, pipeline de bundle, errores de red y entradas malformadas.
- `pwa/` — PWA completa lista para GitHub Pages:
  - `index.html` — shell + CSS completo (mobile-first, dark mahogany/brass palette, instalable)
  - `app.js` — primer arranque, flujo sin fricción diario, UI de cifrado/descifrado, envío a Telegram
  - `cipherEngine.js` + `secure-vault.js` — copiados desde el repo privado, sin secretos
  - `manifest.json` — metadata para instalación como app nativa
  - `service-worker.js` — cache-first para el shell, network-first para `encrypted-bundle.json`
  - `icons/` — 3 tamaños (192, 512, maskable-512)
  - `fonts/` — Gloock, Crimson Pro, IBM Plex Mono (self-hosted, funciona offline sin CDN)

### Fixed
- **Protección at-rest incompleta para credenciales y corpus** (P3-2 y P3-3) — La bóveda sellada (Layer 2) fue implementada completamente en la interfaz. Al activar la seguridad por PIN, tanto el corpus (`tangos.json`) como las credenciales de Telegram se cifran en IndexedDB (`secure-vault.js`), asegurando protección at-rest real para dispositivos perdidos o robados.
- **Limpieza de código muerto y artefactos temporales** — Se removieron archivos residuales, parches de merge y helpers no utilizados para dejar el repositorio sin código redundante ni archivos de respaldo innecesarios.
- **Zero-Knowledge contradicted by public corpus** — resuelto mediante arquitectura de doble repositorio (Fase 3): `tangos.json` y `SALT` viven solo en el repo privado; GitHub Actions los cifra con AES-GCM antes de publicar al repo público. El corpus nunca queda expuesto en texto plano.
- **`[palabra]` fallback filtraba texto plano** — reemplazado en ambos motores (Python y JS): las palabras fuera del corpus se cifran con XOR SALT en hex, marcadas con `#`. Ningún literal visible transita por Telegram.
- **JS `\w` ASCII-only rompía palabras acentuadas** — `cipherEngine.js` reemplazó `/\w+/g` por `/\p{L}+/gu`. `mañana` ya no se parte en `['ma','ana']`.
- **SALT hardcodeado expuesto en fuente pública** — `DEFAULT_SALT = 47` documentado como placeholder de desarrollo. En producción se inyecta como secreto de GitHub Actions (`CIFRADO_SALT`). `cipher_engine.py` lo resuelve en tiempo de llamada via `_resolve_salt()`.
- **Round-trip con pérdida de puntuación y capitalización** — ambos motores tokenizán carácter a carácter: `^C`/`^U` preservan mayúsculas, `~hex` preserva puntuación y espacios. Round-trip lossless verificado por tests.
- **Letras fabricadas mezcladas con letras auténticas sin distinción** — versos de relleno marcados con `"padding": true`. Campo `_nota` explica la convención. Docs corregidos.
- **`PASOS_PROYECTO_CIFRADO_TANGOS.md`** — muestra del corpus actualizada; token de ejemplo corregido a `V09P01`; formato actualizado a `50-V09P01-~20-V09P02...`.
- **`main.py` crasheaba con traceback** ante ID de tango inválido — envuelto en `try/except ValueError`.
- **Dígitos tokenizados carácter a carácter** — ahora se agrupan en una sola corrida de dígitos y se codifican como un único token `#hex`.
- **Fallback de un solo byte trivialmente reversible** — el fallback `#hex` ya no usa XOR directo contra el SALT (un byte, 256 posibilidades). Reemplazado por `PBKDF2-HMAC-SHA256(key=SALT, nonce=token_index)` como keystream, produciendo una clave distinta por token. El atacante necesita conocer tanto el SALT como la posición del token para intentar una clave. Python usa `hashlib.pbkdf2_hmac`; JS usa `SubtleCrypto.deriveBits`.
- **`descifrar_mensaje` lanzaba `IndexError`/`KeyError` silenciosos** ante mensajes corruptos o truncados — reemplazado por validación defensiva explícita en ambos motores (Python y JS): formato vacío, separador faltante, clave no numérica, índices de verso/palabra fuera de rango, tokens de coordenada malformados y hex fallback inválido ahora lanzan `ValueError`/`Error` con mensaje descriptivo.
- **Frecuencia de coordenadas predecible (book cipher first-match)** — `cipher_engine.py` y `pwa/cipherEngine.js` ahora recopilan *todas* las ocurrencias de una palabra en el tango y eligen una aleatoriamente (`secrets.choice` en Python, `crypto.getRandomValues` en JS). La misma palabra ya no produce siempre el mismo `VxxPyy`, reduciendo ataques de análisis de frecuencia. Decifrado es compatible: cualquier coordenada válida sigue mapeando a la misma palabra.

### Changed
- `cipher_engine.py` — `salt=None` por defecto; `_resolve_salt()` lee `CIFRADO_SALT` del entorno; `iter_tangos()` itera solo entradas de tango reales saltando claves `_`; guarda de claves metadata en `cifrar/descifrar`; fallback reemplazado con PBKDF2 keystream; `descifrar_mensaje` completamente defensivo.
- `cipherEngine.js` — dígitos agrupados como un token de fallback en vez de uno por carácter; fallback reemplazado con `SubtleCrypto.deriveBits`; funciones exportadas ahora son `async`; `descifrarMensaje` completamente defensivo (mismo contrato que Python); guarda de claves `_` en `cifrarMensaje`.
- `tests/cipherEngine.test.mjs` — 15 tests JS usando `node:test`: 5 round-trips, 2 errores de cifrado, 8 casos defensivos de descifrado. Ejecutar con `node --test tests/cipherEngine.test.mjs`.
- `PASOS_PROYECTO_CIFRADO_TANGOS.md` — firmas de funciones marcadas como `async`; ejemplo de uso completo con `await` añadido.
- `cipher_engine.py` y `cipherEngine.js` — comentario añadido distinguiendo el "SALT" de enmascaramiento de ID del tango vs. un KDF salt criptográfico.
- `main.py` — delega HTTP a `telegram_client.py`; `salt=None` explícito con comentario; credenciales desde `.env`.
- `README.md` — referencia `.env` como única fuente de credenciales; apunta a `TROUBLESHOOTING.md`.
- `scripts/setup_private_core.sh` — configurado con la URL del repo privado y el SHA del commit fijado (pinned) para prevenir cambios no intencionados en la lógica del backend.
- `.env.example` — actualizado para incluir marcadores de posición para `GITHUB_TOKEN` y `CLAVE_DESPLIEGUE`.
- Guardrail de seguridad para prevenir fugas del repo privado: se documentó la configuración de `git config core.hooksPath hooks` en [README.md](README.md) para activar el hook `hooks/pre-commit` que bloquea commits de `private_core/`.
- Soporte para normalización Unicode NFKC en la derivación de claves de despliegue para que `CLAVE_DESPLIEGUE` funcione igual entre NFC/NFD en distintos sistemas.
- Cobertura de regresión para el nuevo contexto de keystream fallback y la compatibilidad de passphrases de despliegue en los tests Python y Node.
- La lógica de build y decrypt del bundle ahora resuelve el corpus vendored desde `private_core/tangos.json` cuando se ejecuta desde esta estructura de repo público.

- Rebuilt `pwa/encrypted-bundle.json` with an updated deployment passphrase and pushed the artifact to the public repo so installed clients can unlock the latest bundle.
- Increased base font-size for mobile readability in [pwa/index.html](pwa/index.html); bumped `CACHE_VERSION` in [pwa/service-worker.js](pwa/service-worker.js) to `tango-cifrado-v2` so clients refresh the application shell and pick up the styling change.

### Initial
- `cipher_engine.py` con algoritmo de cifrado/descifrado por coordenadas de tango y SALT=47.
- `main.py` con integración a la API de Telegram Bots.
- `tangos.json` con corpus base (Mano a mano, Cambalache).
