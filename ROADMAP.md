# ROADMAP — Sistema de Cifrado por Tangos

## Orden de desarrollo — qué hacer y por qué en este orden

El orden siguiente está fijado por dependencias técnicas y por impacto en el usuario real. No se trata de preferencias: cada ítem es prerequisito del siguiente.

### 1. Fase 10.1 — Chunking de mensajes largos ✅ Completado
`chunkCipherText()` en `pwa/deeplink.js`. `enviarATelegram()` en `app.js` actualizado. 9 tests nuevos. 50/50 JS pass.

### 2. Regenerar assetlinks.json con la keystore limpia ✅ Completado
`assetlinks.json` actualizado con fingerprint `90:17:F1:AA:...`. Repo `misbusquedaspersonales-cyber.github.io` creado para servir el archivo en el root domain (requerido por Android DAL). Verificado vía `curl` — HTTP 200, `application/json`, fingerprint correcto.

### 3. Verificar que el deep link abre el APK instalado, no el navegador ← PRÓXIMO
**Prerequisito: paso 2 completado ✅.** Confirmar con Google DAL tool y en dispositivo real que el botón "Descifrar →" abre el APK instalado en lugar de Chrome.

### 4. Fase 2 — Ampliación del corpus (continua, en paralelo)
Con solo 7 tangos muchas palabras comunes caen al fallback XOR hex. Es trabajo de contenido, no de código — se puede hacer en paralelo con cualquier otra fase.

### 5. P4-2 — Split de `app.js` en `core/` y `ui/`
`app.js` está en 732 líneas. Antes de agregar el selector de imágenes (Fase 10.2) hay que hacer este split o el archivo se vuelve inmanejable.

### 6. Fase 10.2 — Envío de imágenes (sin cifrar)
Una vez que `app.js` está dividido, agregar el selector de archivos y `sendPhoto`/`sendMediaGroup`. Las imágenes viajan sin cifrar en esta fase — intencional, documentado en la UI.

### 7. Fase 10.3 — Cifrado de imágenes
Completa el modelo de seguridad para mensajes con imágenes. Después de 10.2, no antes.

### 8. Fase 9.3 — CI: APK generado automáticamente en cada release
Automatizar la generación del APK en GitHub Actions una vez que el flujo de contenido esté estable. No automatizar antes: bake un pipeline de CI alrededor de una keystore quemada es inútil.

### Lo que NO se hace (y por qué)
**Transporte propio (app-to-app sin Telegram):** requiere un servidor propio o WebRTC P2P — rompe el costo $0, agrega infraestructura que hay que mantener, y resuelve un problema que no existe. El envío actual ya es silencioso (no abre Telegram). El único punto de fricción real es el botón "Descifrar →" que abre Chrome en lugar del APK, resuelto en el paso 3.

---

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
- [x] Script utilitario para verificar cobertura de palabras contra un texto de prueba — `scripts/dev/check_coverage.py` + `tests/python/test_check_coverage.py`. Recreados (los originales nunca fueron commiteados). 11 tests, 11/11 pass.

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

## Fase 7: Recepción de Mensajes (Circuito Completo) ❌ No implementado

### Objetivo real

No es "replicar las notificaciones de Telegram" — Telegram ya las resuelve mejor de lo que este proyecto podría replicar gratis (push nativo, confiable, iOS y Android, cero infraestructura nueva). El problema real es el paso siguiente: **de "vi la notificación" a "el texto cifrado ya está en el campo Descifrar, listo para un click"**, sin copiar/pegar a mano y sin cambiar de app conscientemente.

### Por qué se descarta `getUpdates` (polling)

`getUpdates` solo devuelve mensajes que un humano le envió *al bot*. Nunca devuelve lo que el propio bot mandó via `sendMessage` — no es un límite de configuración, es que el Bot API no tiene ningún endpoint para leer el historial de mensajes salientes. Como "Enviar" usa `sendMessage`, lo que entrega es estructuralmente invisible para cualquier dispositivo que haga polling de `getUpdates`. El polling no funciona para este caso de uso.

### Diseño propuesto: deep link con botón inline

**Cómo funciona:**

1. Al hacer "Cifrar + Enviar", además del texto cifrado, `sendMessage` adjunta un `inline_keyboard` con un botón tipo `url` que apunta a `pwa/index.html#c=<código-cifrado-urlencoded>`.
2. El receptor ve la notificación nativa de Telegram. Toca el botón — no necesita copiar nada.
3. Se abre la PWA. `app.js` lee `location.hash` al cargar, detecta `#c=...`, pone el mode en "Descifrar", pre-carga el textarea, y limpia el hash de la URL.
4. El receptor hace click en "Descifrar".

**Por qué el fragmento (`#c=`) y no un query param (`?c=`):**

El fragmento nunca se envía al servidor en un request HTTP — no aparece en logs de acceso de GitHub Pages ni en `Referer`. Con GitHub Pages estático es defensa en profundidad más que necesidad estricta, pero es gratis y reduce superficie de exposición del texto cifrado.

**Por qué un botón inline y no la URL pegada en el texto del mensaje:**

Si la URL apareciera como texto plano, Telegram generaría una vista previa del link — sus servidores harían un fetch de esa URL, exponiendo el texto cifrado a la infraestructura de Telegram innecesariamente. Un botón `url` en un `inline_keyboard` no dispara preview: solo se resuelve cuando el usuario lo toca desde su propio cliente.

**Problema de redirect a resolver primero:**

`index.html` y `go.html` redirigen a `pwa/index.html` con un `<meta http-equiv="refresh">` estático que no reenvía el fragmento. Dos opciones:
- **Simple:** el deep link siempre apunta directo a `.../pwa/index.html#c=...`, nunca a la URL corta de raíz.
- **Más robusto:** cambiar el redirect a JS (`location.replace('./pwa/index.html' + location.hash)`), así cualquier link corto también preserva el fragmento.

### Consideraciones de seguridad

- **No auto-descifrar sin confirmación explícita.** Si el vault está bloqueado, el deep link pre-carga el campo y se detiene — el PIN sigue siendo el gate, igual que hoy. Si el vault ya está desbloqueado en la sesión, se puede ofrecer un botón "Descifrar ahora" prominente, pero seguir exigiendo el click, nunca auto-ejecutar.
- El código cifrado quedará en el historial de navegación del dispositivo (URL con fragmento). Es la misma clase de exposición que ya existe hoy (mensaje en Telegram, `localStorage` del vault) — no es un nuevo tipo de riesgo, pero vale documentarlo.
- Limpiar el fragmento con `history.replaceState` apenas se lee, para que no quede visible en la barra de direcciones ni se re-dispare al hacer refresh.

### Fases propuestas

#### Fase 7.1 — Deep link básico (sin infraestructura nueva)
- [x] `enviarATelegram()` en `app.js`: agregar `reply_markup` con `inline_keyboard` de un botón `url` → `pwa/index.html#c=<código>`.
- [x] `app.js` al iniciar: leer `location.hash`, detectar `c=`, cambiar a modo Descifrar, pre-cargar el textarea, limpiar el hash con `history.replaceState`.
- [x] Resolver el redirect de `index.html`/`go.html` para no perder el fragmento.
- [x] Test manual: enviar desde un dispositivo, tocar el botón desde la notificación de Telegram en el otro, confirmar que llega pre-cargado.

#### Fase 7.2 — Pulido de UX
- [x] Manejo de error si el fragmento no es un código cifrado válido — el campo se pre-carga igual y el error descriptivo existente de `descifrarMensaje()` aparece en el status al hacer click en Descifrar. Confirmado con prueba manual (`#c=esto-no-es-un-codigo` → "Clave enmascarada no es un número: 'esto'").
- [x] Si el vault ya está desbloqueado en esa sesión (flujo sin fricción), `handleRunAction()` se dispara automáticamente al entrar al compositor — el receptor ve el texto descifrado directamente sin ningún click extra. En el flujo con PIN o primer desbloqueo, se muestra el hint "Mensaje recibido — tocá Descifrar para leerlo." en su lugar.

#### Fase 7.3 — Inbox real dentro de la PWA (opcional, solo si hay necesidad concreta)
- [ ] Solo si Fase 7.1 no cubre la necesidad: evaluar MTProto/GramJS para leer el chat como la cuenta real del receptor. Es sustancialmente más complejo y sensible en términos de seguridad (una sesión de usuario de Telegram es más poderosa que un token de bot). No implementar sin una razón concreta.

## Fase 8: Mejoras de UX (Ideas a Evaluar)

### Flujo de acción unificado para Copiar / Enviar a Telegram

- [ ] Evaluar si vale implementar el flujo unificado (ver descripción abajo).

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

## Fase 9: Distribución como APK Android (TWA) � Parcialmente completado

### Contexto

Instalar la PWA en Android requiere que el usuario encuentre la opción "Instalar app" o "Agregar a pantalla de inicio" en el menú de Chrome — un paso confuso para usuarios no técnicos. Un APK descargable elimina esa fricción: el receptor lo instala como cualquier otra app Android (doble tap → Instalar), sin tocar el navegador.

### Enfoque: Trusted Web Activity (TWA)

Una TWA es un wrapper Android mínimo que muestra una URL en Chrome Custom Tabs con verificación de Digital Asset Links — sin barra de dirección, sin browser chrome, idéntico a una app nativa. El código de la PWA no cambia en absoluto.

Ventajas para este proyecto:
- El APK pesa ~2 MB (solo el wrapper, no una copia de la app)
- Sigue apuntando a GitHub Pages — updates de la PWA llegan automáticamente sin resubir el APK
- No requiere Google Play — se distribuye como sideload (archivo `.apk` directo)
- Firma con una clave propia, sin dependencia de tiendas

### Lo que hay que construir

#### Fase 9.1 — APK básico con TWA ✅ Completado
- [x] Proyecto TWA en `tango-cifrado-apk/` con `twa-manifest.json` configurado.
- [x] `LauncherActivity` apuntando a `https://misbusquedaspersonales-cyber.github.io/tango_cipher_bot_public/pwa/index.html`.
- [x] `assetlinks.json` publicado en `pwa/.well-known/assetlinks.json`.
- [x] Keystore generada fuera del repo en `~/tango-signing/` (nunca comprometida).
- [x] Scripts de build: `scripts/apk/build-apk.sh`, `generate-keystore.sh`, `generate-assetlinks.sh`, `install-deps.sh`.
- [x] APK firmado generado en `dist/apk/app-release-signed.apk` (1.1 MB) — firmado con `~/tango-signing/android.keystore` (fingerprint `90:17:F1:AA:...`).
- [x] Distribución por sideload probada — APK enviado al cliente por email e instalado.
- [x] `assetlinks.json` publicado en `pwa/.well-known/assetlinks.json` — fingerprint `90:17:F1:AA:...` (keystore limpia `~/tango-signing/`).

#### Fase 9.2 — Icono, nombre y metadata Android ✅ Completado
- [x] Nombre de app "Tango Cifrado" configurado en `twa-manifest.json`.
- [x] Ícono tomado de `pwa/icons/icon-512.png` e `icon-maskable-512.png`.
- [x] Colores de splash/theme (`#1a110f`) sincronizados con la PWA.
- [x] `versionCode: 1` / `versionName: "1.0.0"` en `twa-manifest.json`.

#### Fase 9.3 — CI: APK generado automáticamente en cada release ❌ No implementado
- [x] `.github/workflows/build-twa-apk.yml` existe — el workflow está definido.
- [ ] Verificar que el workflow funciona end-to-end en GitHub Actions (la keystore debe estar disponible como secret en el repo, o el workflow usa sideload manual).
- [ ] Subir el APK como release asset a GitHub Releases en cada tag — así el cliente siempre descarga la última versión desde una URL fija sin necesidad de reenviar el archivo manualmente.

### Consideraciones

- **`assetlinks.json`** es el paso más crítico y el más fácil de olvidar. Sin él la TWA muestra la URL en la barra — el receptor ve que es una web, no una app. Requiere el SHA-256 del certificado de firma del APK.
- **Sideload en Android:** el receptor debe habilitar "Instalar apps de fuentes desconocidas" en Ajustes → Seguridad (o en Ajustes de la app desde donde abre el APK, dependiendo de la versión de Android). Es un paso de un solo click pero hay que instruirlo.
- **iOS:** TWA es exclusiva de Android. Para iOS la única opción nativa sin App Store es la instalación PWA desde Safari (Compartir → Agregar a pantalla de inicio), que es más visible en Safari que en Chrome móvil. No hay equivalente a sideload en iOS.
- **Updates:** como la TWA apunta a la URL de GitHub Pages, cualquier cambio en la PWA llega automáticamente sin resubir el APK. Solo hay que subir un APK nuevo cuando cambia el wrapper Android (nombre, ícono, permisos, versión mínima de Android).

## Fase 10: Mensajes Largos e Imágenes ❌ No implementado

### Objetivo

Permitir enviar artículos completos (texto largo) e imágenes por Telegram desde la PWA. Las imágenes viajan sin cifrar en esta primera iteración — la prioridad es que lleguen. El texto sigue cifrado como siempre.

### Fase 10.1 — Mensajes de texto largos (chunking automático) ✅ Implementado

**Implementado en `pwa/deeplink.js` (`chunkCipherText`) y `pwa/app.js` (`enviarATelegram`, `handleSend`).**

- `chunkCipherText(codigo, maxLen=4096)` — función pura exportada desde `deeplink.js`. Corta en límites de token (`-`), reserva 8 chars para el prefijo `[i/N]`. Fast-path: si el mensaje cabe en un mensaje, devuelve el array con el string original sin prefijo.
- `enviarATelegram()` — envía los chunks secuencialmente. Solo el último lleva el `inline_keyboard` con "Descifrar →"; su deep-link apunta al ciphertext **completo**, no al chunk.
- `handleSend()` — muestra progreso ("Enviando parte 1 de 3…") y resultado ("Enviado en 3 partes.").
- 8 tests nuevos en `deeplink.test.mjs`. 50/50 JS pass.

**Consideración de seguridad:** los chunks intermedios contienen fragmentos del ciphertext en texto plano en Telegram. Esto no rompe el cifrado pero expone el tamaño aproximado del mensaje original. Aceptable para el caso de uso actual.

---

### Fase 10.2 — Envío de imágenes (sin cifrar, primera iteración)

**Objetivo:** adjuntar una o más imágenes al mensaje cifrado. Las imágenes viajan sin cifrar — el receptor las ve directamente en Telegram. La información sensible sigue yendo en el texto cifrado; las imágenes son material de contexto (artículos, capturas, documentos escaneados).

**Diseño propuesto:**

1. Agregar un campo `<input type="file" accept="image/*" multiple>` en el compositor, visible solo en modo Cifrar.
2. Al hacer "Enviar a Telegram", si hay imágenes seleccionadas:
   - Primero enviar el texto cifrado (con chunking si corresponde, Fase 10.1).
   - Luego enviar cada imagen con `sendPhoto` (una por llamada) o un `sendMediaGroup` si son varias. El caption de la primera imagen puede llevar el botón "Descifrar →" como alternativa al último chunk de texto — a definir en la implementación.
3. Las imágenes se leen como `File` objects del input y se suben directamente a la Bot API como `multipart/form-data` — sin pasar por ningún servidor propio.

**Limitaciones de Telegram a respetar:**
- `sendPhoto`: imagen hasta 10 MB, dimensiones hasta 10000px por lado, suma de ancho+alto ≤ 10000px.
- `sendDocument`: hasta 50 MB — alternativa para imágenes grandes o PDFs (sin compresión de Telegram).
- `sendMediaGroup`: hasta 10 archivos por grupo.

**Cambios necesarios:**
- `pwa/index.html`: agregar el `<input type="file">` y el área de preview de miniaturas.
- `app.js`: `enviarATelegram()` necesita recibir opcionalmente un array de `File`. Candidato natural a extraerse a `core/telegram.js` una vez que se haga el split de P4-2 — implementar pensando en esa separación.
- `app.js`: `handleSend()` orquesta texto + imágenes secuencialmente.
- El botón "Enviar" debe mostrar progreso cuando hay varios archivos (`"Enviando imagen 2 de 3…"`).

**Consideración de seguridad:** las imágenes viajan sin cifrar por la infraestructura de Telegram. El receptor y cualquier admin de Telegram con acceso al chat las pueden ver. Documentar esto claramente en la UI (un texto pequeño junto al selector de imágenes: "Las imágenes se envían sin cifrar.").

**Orden de desarrollo:** el cifrado de imágenes es un paso separado que viene después, en Fase 10.3. Fase 10.2 resuelve exclusivamente la infraestructura de envío (selector de archivos, `sendPhoto`/`sendMediaGroup`, progreso). No mezclar los dos problemas: el envío de imágenes sin cifrar es útil por sí solo y es el prerequisito necesario para poder cifrarlas después.

---

### Fase 10.3 — Cifrado de imágenes (paso siguiente a 10.2, no opcional)

**Prerequisito:** Fase 10.2 completada y en uso real.

Esta fase completa el modelo de seguridad para mensajes con imágenes: después de que 10.2 resuelve el *cómo enviar*, 10.3 resuelve el *cómo proteger lo que se envía*.

- Cifrar la imagen como blob binario → base64 → AES-GCM con la misma clave derivada de `CLAVE_DESPLIEGUE`, y enviarla como `sendDocument` con un nombre de archivo genérico (sin extensión reveladora).
- El receptor descifra el blob en la PWA antes de mostrarlo — el flujo es análogo al descifrado de texto: botón "Descifrar imagen" junto a cada archivo recibido.
- El tamaño de la imagen cifrada en base64 será ~33% mayor que el original — factor a tener en cuenta con el límite de 50 MB de `sendDocument`.
- Diseñar la UI de descifrado de imágenes en esta fase, no antes — el diseño correcto depende de lo que la experiencia real de 10.2 revele sobre cómo los usuarios interactúan con las imágenes recibidas.
