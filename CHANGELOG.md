# CHANGELOG

## [Unreleased] - 2026-07-25

### Added
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
