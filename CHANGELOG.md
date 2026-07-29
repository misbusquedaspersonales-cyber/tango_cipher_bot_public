# CHANGELOG

## [Unreleased] - 2026-07-29

### Added
- `scripts/check_pwa_assets.py` — validador bidireccional de assets de la PWA:
  - **FORWARD**: toda referencia en `manifest.json` (íconos), `index.html` (`@font-face`, `<link>`, `<img src>`) y `service-worker.js` (`SHELL_FILES`) apunta a un archivo que existe en disco.
  - **REVERSE / huérfanos**: todo `.ttf` / `.png` dentro de `pwa/fonts/` y `pwa/icons/` está referenciado por al menos uno de esos tres archivos (evita publicar fonts/icons muertos que nadie usa pero se siguen subiendo a GitHub Pages).
  - OFL / LICENSE `.txt` y `.md`, y `encrypted-bundle.json` (cargado por `fetch()` en runtime) se exceptúan explícitamente. Sale con `exit 1` en cualquier problema; correrlo antes de cada PR que toque `pwa/`.
- `MOBILE_TESTING.md` — guía paso a paso para probar la PWA como app *instalada* en un celular real: USB debug + `chrome://inspect#devices` + port-forward para Android/Chrome, camino HTTPS/producción para iPhone, y checklist (standalone, icons/fonts sin fallback, offline, primer desbloqueo del bundle).
- `.nojekyll` en el root del repo y `pwa/.nojekyll` en el directorio de la PWA — le indica a GitHub Pages que no corra Jekyll durante el deploy. Sin estos, Jekyll saltea archivos/dirs cuyo nombre empiece con `_` y puede servir `service-worker.js` con MIME/scope incorrecto, rompiendo el register/update del service worker cuando la PWA se instala en Android.
- **URL final de producción (HTTPS, instalable en Android/iPhone sin USB)**: `https://misbusquedaspersonales-cyber.github.io/tango_cipher_bot_public/pwa/index.html` — la PWA se despliega automáticamente desde la rama `main`, directorio `/`, por GitHub Pages. Verificada mediante API: `GET /repos/:owner/:repo/pages` devuelve `status=built`, `source.branch=main`, `source.path=/`, `https_enforced=true`.

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

### Changed
- `README.md` — nueva subsección *Verificar integridad de assets de la PWA* documentando `scripts/check_pwa_assets.py`, y puntero a `MOBILE_TESTING.md` para pruebas en celulares reales, todo bajo *Correr los tests*.
- `TO_FIX.md` — tabla de resumen de progreso y tabla quick-reference por archivo actualizadas al estado post-limpieza.
- `ROADMAP.md`, `PASOS_PROYECTO_CIFRADO_TANGOS.md`, `TROUBLESHOOTING.md` — actualizaciones de formato y texto menores para alinear con los cambios Fase 3/4/5.
- `pwa/service-worker.js:21` — `CACHE_VERSION` fijado a `"tango-cifrado-v3"`. Al detectar una actualización (change of SW file bytes from server) `install` event ejecuta `self.skipWaiting()` para activar la nueva versión inmediatamente, y el `activate` handler elimina cualquier caché anterior cuya key no coincida con los nuevos nombres `${CACHE_VERSION}-shell` / `${CACHE_VERSION}-bundle`. Resultado: usuarios que visiten una sola vez con un refresh HTTP limpio purgan automáticamente los shell viejos v1/v2 (con las fuentes serif y los .ttf muertos precacheados) sin necesidad de borrar storage manualmente.
- `pwa/service-worker.js:25` `SHELL_FILES` — lista pruned: removidos los 4 `.ttf` de Gloock + CrimsonPro que ya no se referenciaban en ningún `@font-face`, y mantenidos solo IBMPlexMono-Regular / IBMPlexMono-Bold (usados por los `.chip` del cifrado). SHELL_FILES bajado de 16 → 12 entradas, reduciendo ancho de banda initial install en móviles.

### Tests
- `python3 -m pytest tests/ -q` → **45/45 passed**.
- `npm test` → **19/19 passed**.
- `python3 scripts/check_pwa_assets.py` → **OK green**.
- **Deploy / producción**: curl sobre la URL pública de GitHub Pages confirmó que los 7 archivos críticos del shell de la PWA devuelven `HTTP 200` con `Content-Type` correcto y tamaño razonable:
  - `/pwa/index.html` — 200 / `text/html` / 11.4 KB
  - `/pwa/service-worker.js` — 200 / `application/javascript` / 3.4 KB
  - `/pwa/app.js` — 200 / `application/javascript` / 23.0 KB
  - `/pwa/manifest.json` — 200 / `application/json` / 734 B
  - `/pwa/fonts/IBMPlexMono-Regular.ttf` — 200 / `font/ttf` / 133 KB
  - `/pwa/icons/icon-192.png` — 200 / `image/png` / 4.3 KB
  - `/pwa/encrypted-bundle.json` — 200 / `application/json` / 4.7 KB

## [Unreleased legacy] - 2026-07-25 (contenido anterior previo al reorden)

### Added
- `scripts/check_coverage.py` y `tests/test_check_coverage.py` — script de utilidad para verificar la cobertura de codificación de un texto de prueba contra el corpus de tangos (Fase 2).
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
