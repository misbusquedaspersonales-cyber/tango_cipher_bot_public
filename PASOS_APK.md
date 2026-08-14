# PASOS_APK — Estado y Referencia APK TWA (Fase 9)

## Estado actual (2026-08-12, keystore limpia + assetlinks corregidos + root Pages repo creado)

| Artefacto | Estado | Nota |
|---|---|---|
| `~/tango-signing/android.keystore` | ✅ Limpia, fuera del workspace | RSA-2048, validez 10000 días |
| `~/tango-signing/keystore-password.txt` | ✅ En disco, modo 0600, fuera del workspace | Nunca expuesta vía export |
| `tango-cifrado-apk/twa-manifest.json` | ✅ En repo | packageId=com.tangocifrado.app |
| `.well-known/assetlinks.json` | ✅ En `tango_cipher_bot_public` | SHA-256 `90:17:F1:AA:...` |
| `pwa/.well-known/assetlinks.json` | ✅ En `tango_cipher_bot_public` | Idéntico al anterior |
| `misbusquedaspersonales-cyber.github.io` repo | ✅ Creado y live | Sirve assetlinks en el root domain (requerido por DAL) |
| `pwa/manifest.json` | ✅ URLs absolutas | Requerido por TWA |

**SHA-256 activo (keystore limpia `~/tango-signing/`):**
```
90:17:F1:AA:90:6B:9C:C7:4E:AB:A5:33:B6:86:B3:66:EC:6F:91:73:D0:C0:36:CB:9B:B7:59:31:C2:70:E8:B6
```

**Package name:** `com.tangocifrado.app`

> ℹ️ Android verifica DAL contra `https://misbusquedaspersonales-cyber.github.io/.well-known/assetlinks.json`
> (el root domain del `host` en `twa-manifest.json`). Ese archivo es servido por el repo
> `misbusquedaspersonales-cyber.github.io`. El archivo en `tango_cipher_bot_public` es un espejo.
>
> ⚠️ Las dos keystores anteriores (sandbox `13:E4:E0:6B:...` y segunda `37:9D:88:CF:...`) están
> quemadas — sus contraseñas quedaron expuestas vía workspace export. La keystore activa está en
> `~/tango-signing/`, fuera del workspace, y nunca apareció en ningún export.

---

## Credenciales que tenés que guardar YA en un backup cifrado

```
ARCHIVO:        tango-cifrado-apk/android.keystore
ALIAS:          android
CONTRASEÑA:     la que escribiste cuando corriste generate-keystore.sh
                (guardala en tu gestor de contraseñas — NO está en este archivo)
PACKAGE NAME:   com.tangocifrado.app
HOST:           misbusquedaspersonales-cyber.github.io
SCOPE PWA:      /tango_cipher_bot_public/pwa/
START URL:      /tango_cipher_bot_public/pwa/index.html?src=twa-apk

SHA-256 CERTIFICATE FINGERPRINT:
   90:17:F1:AA:90:6B:9C:C7:4E:AB:A5:33:B6:86:B3:66:EC:6F:91:73:D0:C0:36:CB:9B:B7:59:31:C2:70:E8:B6
```

Si perdés la keystore o su contraseña, tenés que generar una nueva identidad
de app y todos los usuarios deben desinstalar y reinstalar el APK.

---

## Lo único que falta correr

### Paso 1 — Verificar assetlinks con Google ✅ Verificado

El archivo está live en el root domain:
```bash
curl -s "https://misbusquedaspersonales-cyber.github.io/.well-known/assetlinks.json"
# → HTTP 200, SHA-256 90:17:F1:AA:...
```

Para re-verificar con la herramienta oficial de Google:
```
https://developers.google.com/digital-asset-links/tools/generator

Domain:              misbusquedaspersonales-cyber.github.io
App package name:    com.tangocifrado.app
SHA-256 fingerprint: 90:17:F1:AA:90:6B:9C:C7:4E:AB:A5:33:B6:86:B3:66:EC:6F:91:73:D0:C0:36:CB:9B:B7:59:31:C2:70:E8:B6
```

> ⚠️ El DAL tool busca el archivo en el **root domain** (`misbusquedaspersonales-cyber.github.io`),
> no en la ruta del proyecto. Por eso se necesita el repo `misbusquedaspersonales-cyber.github.io`
> separado. El mismo archivo en `tango_cipher_bot_public/.well-known/` lo usa Android internamente.

### Paso 2 — Instalar dependencias (una sola vez)

```bash
chmod +x scripts/apk/*.sh
./scripts/apk/install-deps.sh
# Instala: Node.js 20, JDK 17, @bubblewrap/cli
```

### Paso 3 — Keystore limpia ✅ Completado

La keystore activa está en `~/tango-signing/android.keystore`, generada fuera del workspace.
`build-apk.sh` y `generate-assetlinks.sh` la detectan automáticamente (sin variables de entorno).

Si alguna vez necesitás regenerarla:
```bash
mkdir -p ~/tango-signing
cd ~/tango-signing
/root/JOB-sda2/CIFRADO-TANGOS/Tango/scripts/apk/generate-keystore.sh
# Luego regenerar assetlinks:
cd /root/JOB-sda2/CIFRADO-TANGOS/Tango/tango-cifrado-apk
../scripts/apk/generate-assetlinks.sh
# Copiar assetlinks.json al repo misbusquedaspersonales-cyber.github.io también.
git add .well-known/assetlinks.json pwa/.well-known/assetlinks.json
git commit -m "deploy(assetlinks): new keystore fingerprint"
git push
```

### Paso 4 — Buildear el APK

> ⚠️ **Web Share Target deshabilitado a propósito.** `twa-manifest.json` actual
> (versionCode 7 / 1.3.3) no incluye `shareTarget` — los intent-filters de
> `SEND`/`SEND_MULTIPLE` causaban fallos de instalación en ciertos dispositivos
> Android ("There was a problem parsing the package"). El APK resultante no
> aparece en el menú nativo "Compartir"; los receptores usan el flujo manual
> (`<input type="file">`). Detalle y causa raíz (aún sin identificar): `TO_FIX.md` M-5.

```bash
cd tango-cifrado-apk
KEYSTORE_FILE=~/tango-signing/android.keystore \
  ../scripts/apk/build-apk.sh
```

- La primera vez descarga ~2-5 GB (Android SDK + Gradle). Las siguientes toman ~15s.
- Los `.apk` y `.aab` quedan en `../dist/apk/`.

#### ✅ Verificación post-build obligatoria

No confíes solo en el mensaje "BUILD SUCCESSFUL" — verificá el artefacto real:

```bash
python3 -c "
from pyaxmlparser import APK
apk = APK('dist/apk/app-release-signed.apk')
print('Package:', apk.package)
print('versionCode/versionName:', apk.version_code, '/', apk.version_name)
print('minSdk/targetSdk:', apk.get_min_sdk_version(), '/', apk.get_target_sdk_version())
print('Firmado v1/v2/v3:', apk.is_signed_v1(), apk.is_signed_v2(), apk.is_signed_v3())
print('Web Share Target (SEND intent):', 'android.intent.action.SEND' in str(apk.get_android_manifest_xml()))
"
```

**Resultado esperado:**
- `Package: com.tangocifrado.app` ✅
- `versionCode` > build anterior ✅  
- `versionName` formato "X.Y.Z" ✅
- `Firmado v1/v2/v3: True True True` ✅
- **`Web Share Target: False`** ✅ — Si sale `True`, **NO distribuyas este APK** (bug M-5)

> 💡 **Si falta pyaxmlparser:** `pip install pyaxmlparser --break-system-packages`

### Paso 5 — Transferencia segura e instalación limpia

#### ⚠️ Transferencia segura (evitar corrupción)
**NO uses email (Outlook/Gmail)** — corrompe el archivo. Métodos verificados:
- **Telegram** (Mensajes guardados)  
- **Google Drive/Dropbox** → descargar en el teléfono
- **USB directo** (adb push o cable)

**Verificar integridad:**
```bash
# En PC: anotar el hash
sha256sum dist/apk/app-release-signed.apk

# En teléfono: confirmar que coincide  
adb shell sha256sum /sdcard/Download/app-release-signed.apk
```

#### 🧹 Instalación limpia obligatoria
1. **ANTES:** Desinstalar completamente cualquier "Tango Cifrado" previa (evita conflictos de firma)
2. Abrir el `.apk` descargado → Android pide "Fuentes desconocidas" → habilitar
3. Instalar → abrir
4. **✅ Chequeo definitivo:** NO debe aparecer la barra de URL de Chrome.
   Si aparece → assetlinks no validó → volver al Paso 1.

---

## CI automático — secrets y trigger via `gh` CLI (sin navegador)

> ℹ️ **Los secrets NO se copian con el repo.** Cada vez que migrás a un repositorio nuevo,
> hay que reconfigurarlos. Ver `TROUBLESHOOTING.md` Problema 16 para el contexto completo.

El workflow `build-twa-apk.yml` ya está configurado. Solo faltan los secrets y el trigger.

### Paso A — Verificar que `gh` funciona con el token del `.env`

```bash
GH_TOKEN=$(grep ^GITHUB_TOKEN .env | cut -d= -f2)
curl -s -H "Authorization: Bearer $GH_TOKEN" https://api.github.com/user | grep login
# → "login": "misbusquedaspersonales-cyber"  ← token válido
```

> **Nota:** `gh auth status` puede fallar con "Timeout" si no se hizo `gh auth login`
> interactivo, pero eso no importa — `GH_TOKEN=<token> gh <cmd>` funciona igual.

### Paso B — Configurar los secrets del APK (una sola vez por repo)

```bash
GH_TOKEN=$(grep ^GITHUB_TOKEN .env | cut -d= -f2)
REPO="misbusquedaspersonales-cyber/tango_cipher_bot_public"

# Contraseña de la keystore (leída del archivo en disco)
GH_TOKEN="$GH_TOKEN" gh secret set ANDROID_KEYSTORE_PASSWORD \
  -b "$(cat ~/tango-signing/keystore-password.txt)" -R "$REPO"

# Keystore binaria, codificada en base64 sin saltos de línea (-w0)
base64 -w0 ~/tango-signing/android.keystore | \
  GH_TOKEN="$GH_TOKEN" gh secret set ANDROID_KEYSTORE_B64 -R "$REPO"

# Verificar
GH_TOKEN="$GH_TOKEN" gh secret list -R "$REPO"
```

Salida esperada:
```
ANDROID_KEYSTORE_B64      Updated ...
ANDROID_KEYSTORE_PASSWORD Updated ...
```

### Paso C — Disparar el build

**Opción 1 — Build manual (sin release):**
```bash
GH_TOKEN="$GH_TOKEN" gh workflow run build-twa-apk.yml -R "$REPO"
```

**Opción 2 — Build + release con tag:**
```bash
git tag -a apk/v1.0.0 -m "APK TWA v1.0.0"
git push origin apk/v1.0.0
# El workflow se dispara automáticamente y sube .apk + .aab al GitHub Release.
```

### Paso D — Verificar resultado

```bash
# Ver el run más reciente
GH_TOKEN="$GH_TOKEN" gh run list --workflow=build-twa-apk.yml -L 1 -R "$REPO"

# Si falló: ver en qué step
GH_TOKEN="$GH_TOKEN" gh run view <run-id> -R "$REPO"
```

También disponible en la UI: `https://github.com/$REPO/actions`

---

## Cuándo necesitás un APK nuevo

| Cambio | ¿Nuevo APK? |
|---|---|
| `app.js`, `cipherEngine.js`, UI, textos, flujos, corpus | ❌ No — la TWA apunta a Pages, se actualiza solo |
| Ícono, nombre, splash, color de tema nativo | ✅ Sí |
| `package_name`, `host`, `startUrl` | ✅ Sí (+ nuevo assetlinks + reinstalación) |
| `minSdkVersion`, `targetSdkVersion` | ✅ Sí |

---

## Troubleshooting rápido

| Síntoma | Causa | Solución |
|---|---|---|
| Barra de Chrome visible al abrir el APK | assetlinks no validó | Verificar Paso 1. Confirmar que Pages sirve el JSON con `Content-Type: application/json`. |
| `bubblewrap build` se cuelga sin output | Espera entrada de teclado | Ya está manejado con `CI=true` + `printf 'n\nn\n'` en `build-apk.sh`. |
| `Install @bubblewrap/cli` falla con exit 130 | Prompt JDK interactivo en `npm install -g` — causado por `@bubblewrap/cli@latest` | El workflow ya tiene `BUBBLEWRAP_VERSION: "1.21.1"` y `BUBBLEWRAP_SKIP_JAVA_CHECK: "1"`. Ver `TROUBLESHOOTING.md` Problema 15. |
| "Required secrets guard" falla (❌ Falta ANDROID_KEYSTORE_B64) | Los secrets no se copiaron al nuevo repo | Correr Paso B de esta sección. Ver `TROUBLESHOOTING.md` Problema 16. |
| Gradle crash / out of memory | Poca RAM o JDK incorrecto | Instalar JDK 17 o 21; mínimo 8 GB RAM disponible. |
| APK instala pero pide CLAVE_DESPLIEGUE cada vez | SW o IndexedDB no inicializado en primer arranque | Esperar 10s, cerrar y reabrir. Es normal solo la primera vez. |

