# TROUBLESHOOTING

> Nota: si querés revisar los problemas pendientes y los items de mejora no bloqueantes, consultá [TO_FIX.md](TO_FIX.md). Allí se mantiene el seguimiento de los issues de prioridad media/baja que no afectan el uso normal de la app.

## Problema 1: No tengo el CHAT_ID de Telegram

### Paso 1: Inicia una conversación con tu bot
Abre Telegram, busca tu bot y envíale cualquier mensaje (`/start` o `hola`).

> El bot no responderá — es un canal unidireccional. Enviar ese primer mensaje solo sirve para que Telegram registre tu cuenta y genere un `update` que podamos consultar.

### Paso 2: Consulta los updates del bot

```bash
curl "https://api.telegram.org/bot<TU_BOT_TOKEN>/getUpdates"
```

### Paso 3: Localiza tu CHAT_ID

```json
{
  "result": [
    {
      "message": {
        "chat": {
          "id": 1341610334,
          "first_name": "Tu Nombre"
        },
        "text": "hola"
      }
    }
  ]
}
```

El valor de `"id"` dentro de `"chat"` es tu `CHAT_ID`.

### Paso 4: Agrega los valores a `.env`

```
TELEGRAM_BOT_TOKEN=<tu_token>
TELEGRAM_CHAT_ID=<tu_chat_id>
```

---

## Problema 2: `getUpdates` devuelve lista vacía (`"result": []`)

El bot no ha recibido mensajes aún, o los mensajes expiraron (Telegram los descarta después de 24 h sin leer).

1. Abre el chat con el bot en Telegram y envía `/start`.
2. Ejecuta el `curl` del Paso 2 inmediatamente después.

---

## Problema 3: `getUpdates` devuelve "Unauthorized" (Error 401)

El token es incorrecto o fue revocado. Ve a `@BotFather`, usa `/mybots` → selecciona tu bot → `API Token` → `Revoke current token` y genera uno nuevo.

---

## Problema 4: El script crashea con "ID de tango no encontrado"

El número que ingresaste en el prompt no existe en tu `tangos.json`. Los IDs válidos dependen de cuántos tangos hayas agregado a tu corpus privado. El script muestra un mensaje de error claro y termina de forma limpia.

---

## Problema 5: Error al enviar a Telegram (timeout o sin conexión)

`telegram_client.py` captura `Timeout`, `ConnectionError` y errores HTTP sin crashear. Si ves "Error al enviar mensaje a Telegram", verifica:

1. Conexión a internet activa.
2. `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID` correctos en `.env`.
3. El bot no fue bloqueado o eliminado en Telegram.

---

## Problema 6: La PWA pide `CLAVE_DESPLIEGUE` cada vez que abro la app

No debería ocurrir con el flujo por defecto. La `CLAVE_DESPLIEGUE` se solicita **una sola vez** en el primer arranque para descifrar el bundle. El payload queda guardado en IndexedDB del dispositivo (`savePayloadDirect`). Los arranques posteriores lo cargan directamente sin pedir nada.

Si la PWA vuelve a pedir la clave, significa que IndexedDB fue borrado (limpieza de datos del browser, modo incógnito, o reinstalación). Ingresa la `CLAVE_DESPLIEGUE` nuevamente para reactivar.

---

## Problema 7: `cryptography` no está instalado (error al correr tests del bundle)

```bash
pip install cryptography
```

Si el entorno lo bloquea:

```bash
pip install cryptography --break-system-packages
```

O instalar dentro del virtualenv:

```bash
python3 -m venv venv && source venv/bin/activate && pip install requests python-dotenv cryptography
```

---

## Problema 8: La URL de GitHub Pages muestra 404 (Not Found) o está desactualizada

El despliegue en GitHub Pages puede tardar un par de minutos después de realizar el push.
1. Abre tu repositorio público en GitHub.
2. Ve a la pestaña **Settings** -> **Pages**.
3. Verifica que diga "Your site is live at...".
4. Asegúrate de navegar a `/pwa/index.html` si los archivos de la app se encuentran en la carpeta `pwa/` (ejemplo: `https://misbusquedaspersonales-cyber.github.io/tango_cipher_bot_public/pwa/index.html`).
5. Si ves una versión vieja, fuerza la actualización en tu móvil (limpiar caché o arrastrar hacia abajo para refrescar en Safari/Chrome).

---

## Problema 8.1: La URL remota de git tiene un token embebido

La URL de `origin` no debe contener un PAT en texto claro como `https://<token>@github.com/...`. Este token puede quedar expuesto en la configuración local de git, en respaldos o en cualquier salida de `git remote -v`.

**Síntoma:** `git remote -v` muestra un URL con un token embebido en lugar de una URL limpia.

**Solución:**
1. Reemplaza la URL remota por una versión limpia:
   ```bash
git remote set-url origin https://github.com/misbusquedaspersonales-cyber/tango_cipher_bot_public.git
```
2. Verifica que quedó limpia:
   ```bash
git remote get-url origin
```
3. No guardes tokens en la URL remota. Usa un helper de credenciales o variables/Secrets de GitHub Actions.

---

## Problema 9: El repo privado y el repo público no están sincronizados (Drift)

Este proyecto usa un modelo de dos repos para separar lo sensible de lo público:
- El repo privado contiene el core sensible (`tangos.json`, el SALT y la lógica privada de compilación).
- El repo público contiene la PWA y el bundle cifrado que se despliega en GitHub Pages.

Si el repositorio privado avanza con nuevos tangos o correcciones y este repositorio público no se actualiza (lo que se conoce como *drift*), el modelo prevé una verificación automática mediante un workflow `drift-check.yml` que correría semanalmente y abriría un **GitHub Issue** si detecta que `PRIVATE_CORE_COMMIT` ha quedado viejo.

> El workflow `drift-check.yml` corre automáticamente cada lunes. Si el secreto `PRIVATE_REPO_PAT` no está configurado en este repo público, el workflow fallará — ver Problema 11 para crearlo.

Cuando detectes drift (por alerta automática o por comprobación manual), deberás buscar el nuevo SHA en el repositorio privado, actualizar la variable `PRIVATE_CORE_COMMIT` en `scripts/dev/setup_private_core.sh`, y correr el script localmente para sincronizar tu entorno (detalle paso a paso en Problema 11).

---

## Problema 10: El workflow `build-encrypted-bundle.yml` falla en el paso "Push to PUBLIC repo"

**Síntoma:** el job `build` termina bien (bundle generado, smoke-test OK) pero `deploy-to-public-repo` falla en el último paso con error de autenticación o permisos de push.

**Causa raíz más común:** el secreto `PUBLIC_REPO_DEPLOY_TOKEN` en el **repo privado** está ausente, expirado, o fue creado con permisos insuficientes.

> Nota: en `.env` local este token se guarda bajo la clave `PUBLIC_REPO_DEPLOY_TOKEN`, que es también el nombre del secreto en GitHub Actions.

**Solución:**
1. Generá (o regenerá) un Personal Access Token con permiso **Contents: write** restringido **solo** al repo público `tango_cipher_bot_public`. Fine-grained PAT es lo recomendado (menor blast radius si se filtra).
2. Ve al **repo privado** → Settings → Secrets and variables → Actions → buscá `PUBLIC_REPO_DEPLOY_TOKEN`.
3. Si no existe → **New repository secret**. Si existe → **Update**.
4. Pegá el nuevo token y guardá.
5. Volvé a correr el workflow desde Actions → **Run workflow** (workflow_dispatch).

---

## Problema 11: El workflow `drift-check.yml` falla por error de autenticación

El workflow de GitHub Actions diseñado para detectar si el repositorio privado avanzó (drift-check) requiere acceso de lectura al repositorio privado, el cual no está permitido de forma predeterminada.

**Síntoma:** El Action en la pestaña *Actions* falla con un error como `No se pudo obtener el SHA del repositorio privado. Verifica PRIVATE_REPO_PAT.` o un mensaje de error de autenticación de `git ls-remote`.

**Solución:**
1. Ve a tu cuenta de GitHub -> **Settings** -> **Developer settings** -> **Personal access tokens** (Tokens classic o Fine-grained).
2. Genera un nuevo token con permisos de lectura para el repositorio privado (scope `repo`).
3. Copia el token generado.
4. Ve a la pestaña **Settings** de **este repositorio público**, entra a **Secrets and variables** -> **Actions** -> **New repository secret**.
5. Crea un secreto llamado `PRIVATE_REPO_PAT` y pega allí tu token.

---

## Problema 12: ~~El workflow `drift-check.yml` no existe en el repo~~ ✅ Resuelto

`.github/workflows/drift-check.yml` existe y corre semanalmente (lunes 08:00 UTC). Si abrís un Issue etiquetado `drift` es que el workflow detectó que `PRIVATE_CORE_COMMIT` en `scripts/dev/setup_private_core.sh` quedó viejo respecto al HEAD del repo privado.

El workflow requiere el secreto `PRIVATE_REPO_PAT` en **este repo público** (Settings → Secrets and variables → Actions). Si el workflow falla con error de autenticación, ver **Problema 11** para crearlo. Si querés dispararlo manualmente sin esperar al lunes: Actions → "Drift check" → **Run workflow**.

---

## Problema 13: La PWA no se instala en Android o funciona mal en móvil (deploy a GitHub Pages)

Este problema agrupa todos los fallos móviles Android y de despliegue a Pages. La app está preparada para correr en celulares (tanto en instalación standalone como en navegador), pero hay 7 puntos típicos donde un deploy puede romperse en la práctica. Cada sub-sección abarca un síntoma + diagnóstico + arreglo.

> 📌 Referencia rápida: para validar un deploy nuevo en móvil real, corré primero el checklist de `MOBILE_TESTING.md` §1–§7. Ese documento es release-specific y ya cubre los casos de regresión. Esta sección es para cuando algo falla *igual* y necesitás depurar.

---

### 12.1 Síntoma: Chrome Android no muestra "Instalar app" (solo "Agregar a página principal")

Chrome solo ofrece **Instalar app** (PWA de verdad, standalone, sin barra de navegación) cuando se cumplen **todos** los requisitos siguientes. Falla uno → no hay banner, solo un shortcut de bookmark.

**Diagnóstico uno-por-uno (Chrome → DevTools → Application, conectado por USB con `chrome://inspect#devices`):**

| Paso | Qué mirar | Esperado → ¿Qué pasa si falla? |
|---|---|---|
| 1 | `pwa/manifest.json` linkeado en `index.html` | Debe existir `<link rel="manifest" href="./manifest.json">` en `<head>`. Si no está → agregalo y pusheá de nuevo. |
| 2 | Manifest carga por HTTP 200 | En DevTools → Application → Manifest. Si dice "no manifest found" o HTTP 404 → falta el archivo o el path `/pwa/manifest.json` no coincide. |
| 3 | `display: standalone` en manifest | Campo obligatorio. Si dice `browser` o no está → Chrome nunca ofrece "Instalar app". |
| 4 | Ícono 192×192 PNG + Ícono 512×512 PNG | Deben estar ambos, tipo `image/png`, `sizes` correcto. **Si falta cualquiera de los dos → no hay install prompt.** |
| 5 | Service Worker registrado + handler `fetch` | DevTools → Application → Service Workers. Si "Registration failed" o "No service workers detected" → abrí Consola y buscá errores de `serviceWorker.register()`. Los más comunes: (a) SW servido con MIME type `text/html` porque `.nojekyll` faltó y Jekyll lo transformó, (b) path relativo mal: el SW es `./service-worker.js` y debe estar en la misma carpeta que `index.html` (scope). |
| 6 | Corriendo sobre **HTTPS real** o `localhost` | El deploy de Pages lo hace HTTPS automático con `https_enforced=true`. Si estás probando desde `http://192.168.1.x:puerto` en LAN → Chrome bloquea la instalación. Solo se puede instalar desde `localhost` (loopback) o HTTPS. |
| 7 | HTTPS sin errores de certificado | Si el navegador marca "⚠️ No seguro" en Pages → probablemente el custom domain tiene certificado roto. Sin custom domain Pages lo hace bien auto. |

**Arreglo más común de todos los casos (80%):** falta `.nojekyll` y los assets `service-worker.js`, `manifest.json`, o `fonts/` con guion bajo están siendo omitidos por Jekyll. Agregalo en **ambos** niveles:
```bash
ls -la .nojekyll pwa/.nojekyll
# Si alguno falta:
touch .nojekyll pwa/.nojekyll && git add .nojekyll pwa/.nojekyll && git commit && git push
```

---

### 12.2 Síntoma: Las URLs cortas dan 404 (`/` raíz o `/go.html`)

Estos redirects existen para no tener que escribir la ruta larga en el teclado del móvil (errores de tipeo muy frecuentes). Si dan 404 es **siempre** uno de estos dos casos:

**Caso A: Los archivos no están pusheados a `main` (untracked).**
```bash
git status index.html go.html pwa/go.html
# Si aparecen en "Untracked files" → no van a GitHub Pages.
git add index.html go.html pwa/go.html
git commit -m "feat: root short URL redirects" && git push origin main
```

**Caso B: El push entró pero GitHub Pages aún no construyó.**
Pages suele tardar 30–90s después de un push. Esperá, hacé **hard-refresh** en Chrome Android (menú ⋮ → botón ↻ circular) y si aún así falla esperá 2 minutos más. Podés chequear el estado de construcción en:
```
Repo público → Settings → Pages → "Your site is live at https://…"
                                                        ↑ debe decir "published" hace <2 min.
```

---

### 12.3 Síntoma: "Instalé la app pero sigue apareciendo la barra de URL de Chrome"

Significa que no está en modo `standalone`, sino que es un shortcut de browser. Diagnóstico:

1. **Borrá el shortcut actual** de Home Screen (mantenelo apretado → quitar) — no lo reutilices.
2. Volvé a abrir **directamente** `https://misbusquedaspersonales-cyber.github.io/tango_cipher_bot_public/pwa/index.html` (no desde el redirect primero).
3. Esperá que cargue completamente (incluido el SW install, ~1–2s).
4. ⋮ → **Instalar app** (NO "Agregar a página principal").

Si aún así sigue con barra URL → revisá `apple-mobile-web-app-capable` meta tag en `index.html` (solo iOS lo requiere; Android usa manifest). Para Android el único requisito es `display: standalone` en `manifest.json` y que el Service Worker scope cubra `./` (lo hace porque está en la misma carpeta).

---

### 12.4 Síntoma: Modo Avión no funciona o muestra error críptico "HTTP 0"

Hay **dos escenarios** deliberadamente distintos. El parche de caché v5→v8 arregló el error "HTTP 0 sin contexto". Si volvés a verlo, es que tu teléfono aún tiene un Service Worker **viejo** (versión pre-v8).

**Escenario esperado A — Bundle ya cacheado (uso diario offline):**
App que ya abriste y desbloqueaste una vez → en Modo Avión abre instantáneo, compositor funciona sin conexión. Si no pasa:
- DevTools → Application → Service Workers → Bypass for network OFF (sino sw está desactivado)
- DevTools → Application → Cache Storage → debe existir `tango-cifrado-v8-shell` y `tango-cifrado-v8-bundle`. Si los nombres dicen `v5` o no hay bundle cacheado → te falta 1 vez haber abierto con internet.

**Escenario esperado B — Sin bundle + Sin red (verdadero primer run en avión):**
Aparece mensaje en **español claro**, no un HTTP 0 críptico:
> *"Sin conexión y no hay una copia guardada del paquete cifrado. Conectate a internet y probá de nuevo."*

Si en vez de eso ves `No se pudo descargar ./encrypted-bundle.json (HTTP 0)` → **SW viejo**. Procedimiento para forzar update en Android:
```
Chrome ⋮ → ⓘ (info del sitio) → Permisos y almacenamiento → Administrar espacio → Borrar almacenamiento.
```
Cerrá y volvé a abrir. El SW recién instalado es el v8. Si es una instalación standalone (no Chrome tab), tenés que **desinstalar y reinstalar** la app (settings Android → Apps → Tango → Desinstalar) porque las actualizaciones de SW en modo standalone a veces tardan 24h por política de Chrome.

---

### 12.5 Síntoma: Teclado QWERTY para el PIN (en vez de numérico) / notch corta contenido

**PIN con teclado equivocado (QWERTY):** Faltan los `inputmode="numeric"` en los campos PIN. Verificá `index.html` → el `<input id="new-pin">`, `<input id="confirm-pin">`, y `<input id="device-pin">` tienen que tener **tres** de ellos con `inputmode="numeric"`. Si no → Android no sabe que es campo numérico y abre QWERTY.

**Contenido cortado por notch / cámara selfie / punch-hole (safe-area):**
- Body debe tener padding con `env(safe-area-inset-top/right/bottom/left)` (línea 71 de `index.html`)
- Meta viewport debe incluir `viewport-fit=cover` (línea 5 de `index.html`)
- Si falta cualquiera → el notch tapa el título / el botón Desbloquear. No requiere re-deploy a veces si el CSS ya está bien; si el teléfono tiene Android 10+ y safe-area desactivado globalmente es un setting del launcher.

---

### 12.6 Síntoma: Actualicé el corpus pero la app móvil sigue mostrando tangos viejos (no llega el bundle nuevo)

Por diseño el bundle usa **network-first** para no depender del HTTP cache de Pages (10 min default). Pero:
1. **Asegurate de cerrar y reabrir** la app (no solo cambiar de app). `registration.update()` corre en cada carga, pero si la app quedó en background por mucho tiempo no dispara.
2. Si es instalada standalone, a veces Chrome retrasa la comprobación de update de SW a 24h → podés forzar desinstalando / reinstalando.
3. **Confirmá que el bundle remoto efectivamente cambió**:
   ```
   curl -s -D- -H 'Cache-Control: no-cache' \
     https://misbusquedaspersonales-cyber.github.io/tango_cipher_bot_public/pwa/encrypted-bundle.json \
     | grep -i generated_at
   ```
   Si devuelve la fecha vieja (2026-07-29 en vez de la nueva) → el workflow `build-encrypted-bundle.yml` del repo privado **no corrió exitosamente** o el paso `deploy-to-public-repo` quedó en `📭 skipped (bundle already matches)` porque la comparación de SHA dijo igual. Volvé a correr el workflow dispatch en el privado y mirá el Step "bundle-diff": `OLD_SHA` vs `NEW_SHA` deben diferir para que haga push.

---

### 12.7 Checklist ultra rápido: 6 comandos + 3 clicks para aprobar un deploy móvil

Previo a dar un deploy por bueno en un celular real, ejecutá **en la raíz de la copia local del repo público**:

```bash
# 1) ¿.nojekyll en AMBOS niveles?
ls -la .nojekyll pwa/.nojekyll
# → OK: dos lineas, ninguno muestra "No such file"

# 2) ¿Short URL redirects tracked?
git status --short index.html go.html pwa/go.html
# → OK: no aparecen (están committed)
# → MAL: aparece ?? (untracked) → git add && git commit && push

# 3) ¿Asset integrity (ninguna referencia rota en HTML/JS)?
python3 scripts/dev/check_pwa_assets.py
# → OK: "todos los assets referenciados existen..."

# 4) ¿Test suite pública pasa (13 Python + 19 JS)?
python3 -m pytest tests/python/test_build_encrypted_bundle.py tests/python/test_telegram_client.py -q
npm test
# → OK: 13 passed / 19 pass

# 5) ¿Bundle schema correcto y generated_at nuevo?
python3 -c '
import json,base64,pathlib
b=json.loads(pathlib.Path("pwa/encrypted-bundle.json").read_text())
assert b["version"]==1 and b["aad"]=="tango-cifrado-bundle-v1"
assert len(base64.b64decode(b["nonce_b64"]))==12
assert len(base64.b64decode(b["kdf_salt_b64"]))==16
assert "generated_at" in b; print("generated_at =",b["generated_at"])'
# → OK: generated_at posterior a tu deploy date

# 6) ¿Push command es plain (no fake flags de force)?
grep -A3 "Push to PUBLIC repo" .github/workflows/build-encrypted-bundle.yml | grep "git push"
# → OK: exactamente "git push origin main"
# → MAL: aparece "--ff-only" (flag inválido, rompe antes de conectarse) o "--force-with-lease" (sobreescribe)
```

**Luego, en el celular Android (3 clicks):**
```
Click 1: Abrir short URL (https://…/tango_cipher_bot_public/)  →  redirige en ≤1s
Click 2: ⋮ → Instalar app → abrir desde ícono                     →  sin barra URL
Click 3: Desbloquear una vez, activar Modo Avión, volver a abrir  →  abre instantáneo,
                                                                      sin error críptico.
```

Si las 6 comandos + 3 clicks pasan, el deploy está aprobado para uso diario móvil Android y GitHub Pages.

---

## Problema 14: Cómo configurar el Chat ID para comunicación entre dos personas

### Contexto

El chat ID en `.env` (`TELEGRAM_CHAT_ID=1341610334`) es el DM privado entre el bot y un único usuario. Mensajes enviados a ese ID solo los ve esa persona. Para que dos personas puedan intercambiar mensajes cifrados, necesitan un chat compartido o intercambiar sus IDs personales.

---

### Opción A — Grupo compartido (para primeros intentos)

La más simple para empezar: ambas personas están en el mismo grupo y ven todos los mensajes.

**Setup (una sola vez):**

1. Crear un grupo en Telegram. Agregar a ambos participantes y al bot `@ukotango_bot`.
2. Mandar cualquier mensaje en el grupo (necesario para que `getUpdates` lo detecte).
3. Obtener el chat ID del grupo — ejecutar desde terminal:

```bash
TOKEN=$(grep '^TELEGRAM_BOT_TOKEN=' /root/JOB-sda2/CIFRADO-TANGOS/Tango/.env | cut -d= -f2)
curl -s "https://api.telegram.org/bot${TOKEN}/getUpdates" \
  | python3 -c "
import json, sys
data = json.load(sys.stdin)
for u in data.get('result', []):
    chat = u.get('message', {}).get('chat', {})
    print(chat.get('type'), chat.get('id'), chat.get('title', chat.get('first_name','')))
" | sort -u
```

El grupo aparece con `type=group` o `supergroup` y un ID negativo (ej: `-1001234567890`).

4. Ambos configuran ese ID en la PWA: Ajustes → Chat ID → Guardar.

**Uso:**
- Cualquiera cifra y envía → el mensaje llega al grupo → el otro toca "Descifrar →" → descifra.
- Ambos ven el historial de mensajes cifrados en el chat del grupo.

**Limitación:** todos los mensajes los ve cualquiera en el grupo. Para conversación privada real, usar Opción B.

---

### Opción B — Chat IDs cruzados (uso final, máxima privacidad)

Cada persona envía directamente al DM del bot del otro. Nadie más ve los mensajes.

**Setup:**

1. Tu cliente abre Telegram y envía `/start` a `@ukotango_bot`. Esto abre un DM privado y registra su chat ID.

2. Obtener el chat ID de tu cliente — después de que mande `/start`, ejecutar:

```bash
TOKEN=$(grep '^TELEGRAM_BOT_TOKEN=' /root/JOB-sda2/CIFRADO-TANGOS/Tango/.env | cut -d= -f2)
curl -s "https://api.telegram.org/bot${TOKEN}/getUpdates" \
  | python3 -c "
import json, sys
data = json.load(sys.stdin)
for u in data.get('result', []):
    chat = u.get('message', {}).get('chat', {})
    if chat.get('type') == 'private':
        print('chat_id:', chat.get('id'), '|', chat.get('first_name',''), chat.get('last_name',''))
" | sort -u
```

Aparecerán todos los DMs privados que tuvieron con el bot. Identificar el de tu cliente por nombre.

3. Configuración cruzada:
   - **Vos**: ponés el chat ID de tu cliente en tu PWA (Ajustes → Chat ID). Tus mensajes le llegan a él.
   - **Tu cliente**: pone tu chat ID (`1341610334`) en su PWA. Sus mensajes te llegan a vos.

4. Si `getUpdates` devuelve lista vacía: el bot no recibió mensajes recientes. Pedir al cliente que mande `/start` de nuevo, esperar 10 segundos, y repetir el curl.

**Limitación de `getUpdates`:** solo devuelve los últimos 100 updates y los marca como "leídos" en cada llamada. Si ya los consumiste antes (por ejemplo, el bot los procesó), no aparecen de vuelta. En ese caso, el cliente puede reenviar `/start` para generar un update nuevo.

---

### Verificar que el chat ID es correcto antes de usarlo en producción

```bash
TOKEN=$(grep '^TELEGRAM_BOT_TOKEN=' /root/JOB-sda2/CIFRADO-TANGOS/Tango/.env | cut -d= -f2)
CHAT_ID="<el-id-que-queres-verificar>"
curl -s -X POST "https://api.telegram.org/bot${TOKEN}/sendMessage" \
  -H "Content-Type: application/json" \
  -d "{\"chat_id\": \"${CHAT_ID}\", \"text\": \"test de verificación\"}" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('ok:', d.get('ok'), d.get('description',''))"
```

`ok: True` → el ID es correcto y el bot tiene acceso a ese chat.
`ok: False` + `"chat not found"` → ID incorrecto o el usuario nunca mandó `/start` al bot.
`ok: False` + `"bot was kicked"` → el bot fue removido del grupo.

---

## Problema 15: El archivo `keystore-password.txt` aparece en exports del workspace (Tango_compact.txt o similar)

### Qué pasó

Existía una herramienta (o proceso de agente) que generaba un dump compacto del workspace — `Tango_compact.txt` u otro archivo similar. Esta herramienta leía el filesystem directamente y **no respetaba `.gitignore`**. Dos keystores quedaron expuestas:
- Keystore sandbox (contraseña `TangoCifrado-Sandbox-2026!`) — expuesta en el primer export.
- Segunda keystore (contraseña `SeVestiraDeFiesta`) — expuesta en el segundo export.

### Solución aplicada ✅

**Opción B implementada:** la keystore activa está en `~/tango-signing/`, fuera del workspace. `build-apk.sh` y `generate-assetlinks.sh` detectan esa ruta automáticamente. La herramienta de export solo escanea el workspace — no alcanza `~/tango-signing/`.

`assetlinks.json` fue regenerado con el fingerprint de la nueva keystore (`90:17:F1:AA:...`) y está publicado en:
- `misbusquedaspersonales-cyber.github.io/.well-known/assetlinks.json` (root domain, requerido por DAL)
- `tango_cipher_bot_public/pwa/.well-known/assetlinks.json` (espejo)

`generate-keystore.sh` rechaza las dos contraseñas comprometidas conocidas si se pasan vía `KEYSTORE_PASS`.

---

## Problema 16: DAL tool devuelve `ERROR_CODE_FETCH_ERROR` para `misbusquedaspersonales-cyber.github.io`

### Qué pasó

La herramienta de Google Digital Asset Links busca el archivo en:
```
https://<host>/.well-known/assetlinks.json
```
donde `<host>` es el valor del campo `host` en `twa-manifest.json` — en este caso `misbusquedaspersonales-cyber.github.io`.

Como esta es una GitHub Pages de **proyecto** (repo `tango_cipher_bot_public`), el root domain `https://misbusquedaspersonales-cyber.github.io/` devolvía 404. El archivo estaba publicado bajo `/tango_cipher_bot_public/.well-known/assetlinks.json`, que Android puede usar en algunos contextos, pero el DAL tool y la verificación TWA primaria usan el root.

### Solución aplicada ✅

Se creó el repo `misbusquedaspersonales-cyber.github.io` — un repo con ese nombre exacto se convierte automáticamente en la GitHub Pages raíz del usuario/org. Contiene únicamente:
- `.well-known/assetlinks.json` — el fingerprint `90:17:F1:AA:...`
- `.nojekyll` — para que Jekyll no procese los dotfiles
- `index.html` — redirect a la PWA real

Verificación:
```bash
curl -sI "https://misbusquedaspersonales-cyber.github.io/.well-known/assetlinks.json"
# → HTTP/2 200, content-type: application/json
```

### Si hay que actualizar el fingerprint en el futuro

Actualizar en **tres lugares**:
1. `tango_cipher_bot_public/.well-known/assetlinks.json`
2. `tango_cipher_bot_public/pwa/.well-known/assetlinks.json`
3. `misbusquedaspersonales-cyber.github.io/.well-known/assetlinks.json`

`generate-assetlinks.sh` actualiza los dos primeros automáticamente. El tercero hay que copiarlo a mano al repo raíz y hacer push.
