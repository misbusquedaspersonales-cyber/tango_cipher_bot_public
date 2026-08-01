# ROADMAP — Sistema de Cifrado por Tangos

## Fase 1: Fundación (Python CLI) ✅ Completado
- [x] `tangos.json` con corpus base de tangos clásicos
- [x] `cipher_engine.py` — cifrado/descifrado con coordenadas V/P, SALT dinámico via `_resolve_salt()`, fallback XOR hex, round-trip lossless (capitalización + puntuación + dígitos)
- [x] `telegram_client.py` — envío a Telegram con manejo de errores de red (Timeout, ConnectionError)
- [x] `main.py` — CLI interactivo, delega HTTP a `telegram_client`, errores de crypto capturados
- [x] Credenciales gestionadas via `.env` con `python-dotenv`
- [x] `.env.example`, `.gitignore`, `TROUBLESHOOTING.md`, `CHANGELOG.md`, `README.md`, `ROADMAP.md`
- [x] Suite de tests: 64 tests cubriendo cifrado, descifrado, round-trip, dígitos, SALT por entorno, `iter_tangos`, pipeline de bundle, errores de red y bóveda de seguridad. (45 Python + 19 JS; los 32 tests de `test_cipher_engine.py` requieren `private_core/` poblado vía `scripts/dev/setup_private_core.sh`.)

## Fase 2: Ampliación del Corpus 🔄 En progreso
- [x] Ampliar `tangos.json` de 2 a 7 tangos (versos auténticos + padding técnico marcado con `"padding": true`)
- [ ] Continuar agregando tangos hasta cubrir vocabulario español común (~20+ tangos)
- [?] Script utilitario para verificar cobertura de palabras contra un texto de prueba — `scripts/check_coverage.py` y `tests/test_check_coverage.py` están referenciados en el CHANGELOG pero los archivos fuente no existen en el repo; solo queda bytecode `.pyc`. Ver `TO_FIX.md` F-5.

## Fase 3: Arquitectura de Doble Repositorio ✅ Pipeline implementado
La base de datos (`tangos.json`) y el `SALT` nunca se exponen en el repo público.
El pipeline de despliegue los cifra antes de publicar.

```
[ REPO PRIVADO ]  →  [ GitHub Action ]  →  [ REPO PÚBLICO (GitHub Pages) ]
  tangos.json            AES-256-GCM encrypt      PWA + encrypted-bundle.json
  SALT                   PBKDF2-HMAC-SHA256        (indecodificable sin CLAVE)
  código fuente          con CLAVE_DESPLIEGUE
```

- [x] Crear repo privado con el código fuente — ej: `tangos-cipher-source`
- [x] Crear repo público vacío para GitHub Pages — ej: `tangos-cipher-pwa`
  > Ambos repos deben compartir el mismo prefijo (ej: `tangos-`) para aparecer juntos en la lista de repositorios de GitHub.
- [x] `scripts/build_encrypted_bundle.py` (private repo) — cifra `tangos.json` + SALT con AES-256-GCM. Copia de referencia en `scripts/ci/` del repo público (usada por tests locales — ver nota en ese archivo).
- [x] `scripts/decrypt_bundle_cli.py` (private repo) — smoke-test CLI para verificar el bundle antes del deploy. Copia de referencia en `scripts/ci/` del repo público.
- [x] `.github/workflows/build-encrypted-bundle.yml` — GitHub Action que genera el bundle en cada push

## Fase 4: Motor JavaScript (`cipherEngine.js`) ✅ Completado
- [x] `cifrarMensaje(idTango, mensaje, baseTangos, salt)` — SALT como parámetro dinámico
- [x] `descifrarMensaje(codigoCifrado, baseTangos, salt)` — compatible con el motor Python
- [x] Fallback XOR hex con `#` — elimina literales visibles en el mensaje cifrado
- [x] Round-trip lossless: capitalización (`^C`/`^U`) y puntuación/espacios (`~hex`) preservados
- [x] Tokenización Unicode correcta con `/\p{L}+/gu` (fix bug ASCII-only de `\w`)
- [x] Dígitos agrupados como un único token `#hex` en vez de uno por carácter
- [x] Soporte de versos `padding` en formato `{padding: true, palabras: [...]}`
- [x] Tests unitarios JS de round-trip cifrado/descifrado (`tests/js/cipherEngine.test.mjs`, 15 tests)

## Fase 5: PWA — Interfaz y Almacenamiento Local ✅ Completado
- [x] `secure-vault.js` — gestión de credenciales en el browser con dos capas:
  - Layer 1: `unlockDeployBundle()` — descifra el bundle público con `CLAVE_DESPLIEGUE` (una sola vez, primer arranque)
  - Layer 2 (opcional): `sealForDevice()`/`openDeviceVault()` — PIN de dispositivo para protección at-rest
  - Flujo por defecto sin fricción: `savePayloadDirect()`/`loadPayloadDirect()` — IndexedDB directo, sin PIN diario
- [x] `pwa/index.html` + `pwa/app.js` — interfaz de cifrado/descifrado, dark mahogany/brass palette
  - Primera apertura: solicita `CLAVE_DESPLIEGUE`, descifra el bundle, guarda en IndexedDB
  - Aperturas posteriores: carga directo desde IndexedDB — abrir y usar, sin contraseña
  - Output renderizado como ticker-tape de chips por token (clave enmascarada en brass)
- [x] Envío a Telegram via `fetch` con manejo de errores de red
- [x] Credenciales Telegram (bot token + chat ID) persistidas en localStorage
- [x] `pwa/manifest.json` + `pwa/service-worker.js` — instalable offline en Android/iOS
  - Cache-first para el shell, network-first para `encrypted-bundle.json`
- [x] Fuentes self-hosted (Gloock, Crimson Pro, IBM Plex Mono) — funciona sin CDN

## Fase 6: Despliegue y Distribución ✅ Completado
- [x] Crear repo privado con el código fuente — ej: `tangos-cipher-source`
- [x] Crear repo público vacío para GitHub Pages — ej: `tangos-cipher-pwa`
  > Ambos repos deben compartir el mismo prefijo para aparecer juntos en la lista de repositorios de GitHub.
- [x] Configurar `CLAVE_DESPLIEGUE` y `CIFRADO_SALT` como secretos en GitHub Actions
- [x] Configurar `ACTIONS_DEPLOY_KEY` para push cross-repo al repo público (o usar arquitectura vendored)
- [x] Copiar `pwa/` + `pwa/encrypted-bundle.json` al repo público
- [x] GitHub Pages activo — URL pública accesible desde móvil
- [x] Instalable como PWA desde pantalla de inicio sin tiendas oficiales

## Principios que guían el proyecto
- **Zero-Trust sobre Telegram:** solo transita texto cifrado, nunca el mensaje original
- **Zero-Knowledge en la red y en el repo público:** `tangos.json` y `SALT` solo existen en el repo privado; nunca viajan en texto plano por la red ni quedan en el repo público. A nivel de dispositivo, la seguridad del corpus y las credenciales depende de si el PIN de dispositivo está activado (Layer 2) — ver detalles en Fase 5.
- **SALT como obfuscación, no criptografía:** offset numérico que enmascara el ID del tango. La seguridad real viene de mantener `tangos.json` privado. En producción se inyecta como secreto de GitHub Actions (`CIFRADO_SALT`). `DEFAULT_SALT = 47` es solo un placeholder de desarrollo.
- **Cero Fricción:** `CLAVE_DESPLIEGUE` se ingresa una sola vez al instalar la PWA. A partir de allí, uso instantáneo sin contraseñas.
- **Costo $0:** GitHub Pages + GitHub Actions + Telegram Bot API, todo gratuito
