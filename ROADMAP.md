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

## Fase 7: Mejoras de UX (Ideas a Evaluar)

### Flujo de acción unificado para Copiar / Enviar a Telegram

**Estado actual:** los botones Copiar y Enviar a Telegram solo aparecen después de hacer click en Cifrar. Si el usuario no cifra, no puede copiar ni enviar nada.

**Posible mejora:** hacer que Copiar y Enviar operen sobre lo que haya disponible en cada momento — sin necesidad de cifrar primero:

| Estado | Copiar | Enviar |
|---|---|---|
| Sin texto | deshabilitado | deshabilitado |
| Texto escrito, sin cifrar | copia el mensaje original | envía el mensaje original |
| Texto cifrado | copia el código cifrado | envía el código cifrado |

Esto reduciría la fricción para el caso en que el usuario quiere mandar el texto plano por Telegram directamente (aunque rompería el principio Zero-Trust si el canal no es seguro), y también permitiría copiar el texto original para pegarlo en otro lado antes de cifrarlo.

**Por qué no se implementó todavía:** el flujo actual es intencionalmente lineal — fuerza el paso por Cifrar antes de poder enviar, lo que protege contra envíos accidentales de texto plano por Telegram. Cambiar esto requiere evaluar si el trade-off entre fricción y seguridad operacional vale la pena para el caso de uso real del proyecto.

**Si se implementa:** los botones deben mostrar su estado actual en el label (ej: "Copiar mensaje" vs "Copiar cifrado") y deshabilitarse visualmente cuando no hay nada que copiar/enviar.

## Fase 8: Recepción de Mensajes (Circuito Completo) ❌ No implementado

### Situación actual

El sistema implementa solo la mitad del circuito. Telegram es un canal de salida: el bot entrega el mensaje cifrado pero la PWA nunca lo lee de vuelta. El receptor tiene que abrir Telegram manualmente, copiar el código cifrado, abrir la PWA y pegarlo en el campo Descifrar.

```
Emisor (PWA)       Telegram             Receptor
────────────────────────────────────────────────────────
Cifrar + Enviar →→→ bot entrega   →→→  abre Telegram manualmente
                                        copia el código
                                        abre la PWA manualmente
                                        pega en Descifrar
                                        click Descifrar
                                        lee el mensaje
```

### Lo que falta construir

**1. Leer mensajes entrantes desde el bot (`getUpdates` o webhook)**

La Bot API de Telegram tiene dos mecanismos para recibir mensajes enviados al bot:

- **Polling (`getUpdates`)** — la PWA pregunta periódicamente `GET /bot{token}/getUpdates?offset=...`. Simple, sin infraestructura, funciona desde el browser directamente. La desventaja es latencia (el intervalo de polling) y que consume batería si se hace muy frecuente.
- **Webhook** — Telegram hace un POST a una URL cuando llega un mensaje. Requiere un servidor HTTPS con IP pública. No aplica directamente a una PWA estática en GitHub Pages sin un backend intermedio.

Para este proyecto (PWA estática, costo $0), el polling es el camino natural.

**2. Auto-poblar el campo Descifrar**

Cuando el polling detecta un mensaje nuevo que tiene el formato de un código cifrado (empieza con un número seguido de guión y tokens `V`/`#`/`~`), cargarlo automáticamente en el textarea de Descifrar para que el receptor solo tenga que hacer click en el botón.

**3. Notificación al receptor**

- **Con la app abierta:** un badge o banner en la UI indicando "Mensaje nuevo".
- **Con la app en segundo plano o cerrada:** el service worker puede mostrar una notificación push del sistema operativo via la Web Push API + Notifications API. Requiere que el usuario haya concedido permiso de notificaciones al instalar la PWA.

### Diseño propuesto

```
pwa/app.js
  └── initInbox()
        ├── pollTelegram() — getUpdates cada N segundos
        ├── onMessageReceived(text) — detecta formato cifrado
        │     ├── si es código cifrado → carga en textarea Descifrar
        │     │   y muestra badge "Mensaje nuevo"
        │     └── si es texto plano → ignora o muestra en log
        └── showInboxNotification() — banner en UI o push notification

pwa/service-worker.js
  └── 'push' event handler — muestra notificación del SO si la app está cerrada
```

### Consideraciones antes de implementar

- **Un solo bot para dos usuarios:** el bot recibe mensajes de ambos lados. Hay que distinguir qué mensajes son "para mí" — lo más simple es filtrar por `from.id` o usar un chat compartido donde todos los mensajes son relevantes.
- **`offset` de `getUpdates`:** hay que persistir el último `update_id` procesado (en `localStorage`) para no mostrar mensajes viejos cada vez que se abre la app.
- **Intervalo de polling:** 5-10 segundos es razonable para una conversación humana. Menos de 3 segundos empieza a ser agresivo con la batería del móvil.
- **Permisos de notificación:** la Web Push API requiere consentimiento explícito del usuario. Hay que pedirlo en un momento con contexto (no al arrancar la app en frío).
- **El bot token queda expuesto en el browser:** ya ocurre hoy para enviar mensajes. No es nuevo, pero vale mencionarlo: cualquiera que inspeccione `localStorage` puede leer el token y hacer polling ellos también. La mitigación es el PIN de dispositivo (Layer 2 de `secure-vault.js`).
