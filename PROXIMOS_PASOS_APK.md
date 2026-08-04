# Próximos Pasos — APK TWA (Fase 9)

## ✅ ESTADO ACTUAL DEL REPO (luego del auto-build en sandbox — 2026-08-03)

**Todo el "trabajo sucio" ya está hecho y confirmado.** Lo único que
realmente NO llegó a correr en el sandbox (por espacio en disco, ~5GB de SDK
Android + Gradle) es `bubblewrap build` en sí mismo. VOS solo tenés que
correr **UN SCRIPT** y listo.

### Artefactos PERMANENTES generados (guardalos YA mismo)

| Archivo | Estado | Tamaño | Nota |
|---|---|---|---|
| [tango-cifrado-apk/android.keystore](file:///root/JOB-sda2/CIFRADO-TANGOS/Tango/tango-cifrado-apk/android.keystore) | ✅ EXISTE | 2746 bytes | RSA-2048, valido 10000 días |
| [tango-cifrado-apk/keystore-password.txt](file:///root/JOB-sda2/CIFRADO-TANGOS/Tango/tango-cifrado-apk/keystore-password.txt) | ✅ EXISTE | 1 línea | **CONTENIDO = `TangoCifrado-Sandbox-2026!`** |
| [tango-cifrado-apk/twa-manifest.json](file:///root/JOB-sda2/CIFRADO-TANGOS/Tango/tango-cifrado-apk/twa-manifest.json) | ✅ EXISTE | 33 líneas JSON | packageId=com.tangocifrado.app, alias=android |
| [.well-known/assetlinks.json](file:///root/JOB-sda2/CIFRADO-TANGOS/Tango/.well-known/assetlinks.json) | ✅ EXISTE | 14 líneas JSON | SHA256 real (abajo) |
| [pwa/.well-known/assetlinks.json](file:///root/JOB-sda2/CIFRADO-TANGOS/Tango/pwa/.well-known/assetlinks.json) | ✅ EXISTE | idéntico al root | Cubre ambos casos de Pages |
| [pwa/manifest.json](file:///root/JOB-sda2/CIFRADO-TANGOS/Tango/pwa/manifest.json) | ✅ actualizado | — | URLs ABSOLUTAS (TWA requiere esto) |
| [scripts/apk/build-apk.sh](file:///root/JOB-sda2/CIFRADO-TANGOS/Tango/scripts/apk/build-apk.sh) | ✅ parcheado | — | Auto-responde "No" al prompt JDK para no colgarse |
| [.github/workflows/build-twa-apk.yml](file:///root/JOB-sda2/CIFRADO-TANGOS/Tango/.github/workflows/build-twa-apk.yml) | ✅ parcheado | — | Idem CI=true + stdin con "n\n" |

### 🚨 BACKUP DE LAS CREDENCIALES — COPIAR AHORA EN UN GESTOR DE CLAVES

```
ARCHIVO:        tango-cifrado-apk/android.keystore
ALIAS:          android
CONTRASEÑA:     TangoCifrado-Sandbox-2026!
PACKAGE NAME:   com.tangocifrado.app
HOST:           misbusquedaspersonales-cyber.github.io
SCOPE PWA:      /tango_cipher_bot_public/pwa/
START URL:      /tango_cipher_bot_public/pwa/index.html?src=twa-apk

SHA-256 CERTIFICATE FINGERPRINT (el mismo que en assetlinks.json):
   13:E4:E0:6B:02:33:E1:67:BC:AD:C9:11:FE:78:9B:B6:7D:39:7C:8C:CA:1B:79:22:11:6D:CB:6D:A9:52:39:8B
```

⚠️ Si perdés la keystore o esta contraseña, tenés que generar otra totalmente
distinta y **todos los usuarios tienen que desinstalar la vieja y volver a
instalar la nueva**. Nunca se puede actualizar con otra firma. Guardala.

---

## 🚀 LO ÚNICO QUE TENÉS QUE CORRER EN TU MÁQUINA

### En Linux / macOS / WSL2 (Ubuntu):

```bash
# 1. Ir al repo
cd /ruta/a/tu/repo/Tango

# 2. Instalar deps (saltea esto si ya tenés node>=20, jdk>=17, npm bubblewrap)
chmod +x scripts/apk/*.sh
./scripts/apk/install-deps.sh

# 3. PUBLICAR los assetlinks.json YA GENERADOS en el repo PÚBLICO
#    (ahí está el Pages) — solo una vez:
cd /ruta/al/repo-publico
cp -v /ruta/a/tu/repo/Tango/.well-known/assetlinks.json        .well-known/assetlinks.json
cp -v /ruta/a/tu/repo/Tango/pwa/.well-known/assetlinks.json    pwa/.well-known/assetlinks.json
git add .well-known/assetlinks.json pwa/.well-known/assetlinks.json
git commit -m "deploy(assetlinks): com.tangocifrado.app SHA256 13:E4:E0:6B...39:8B"
git push

# 4. VERIFICAR con Google (OBLIGATORIO, 30 segundos):
#    ir a 👉 https://developers.google.com/digital-asset-links/tools/generator
#    completar:
#       Domain = misbusquedaspersonales-cyber.github.io
#       App package name = com.tangocifrado.app
#       App package fingerprint (SHA256) = 13:E4:E0:6B:02:33:E1:67:BC:AD:C9:11:FE:78:9B:B6:7D:39:7C:8C:CA:1B:79:22:11:6D:CB:6D:A9:52:39:8B
#    Click "Test statement" → tiene que salir ✅ Success.
#    Si no, esperar 60s a que Pages redeployee y reintentar.

# 5. BUILDEAR EL APK (esto es lo único que tarda):
cd /ruta/a/tu/repo/Tango/tango-cifrado-apk
../scripts/apk/build-apk.sh
#   -> La PRIMERA VEZ baja ~2-5 GB (Android SDK + Gradle + build-tools)
#   -> Las builds siguientes son segundos (~15s)
#   -> Los .apk/.aab salen en:  ../dist/apk/

# 6. PROBAR en un teléfono Android real:
#    - Transferir dist/apk/app-release-signed.apk al teléfono (Telegram, USB, etc)
#    - Habilitar "Fuentes desconocidas" en Android cuando pregunte
#    - Instalar → abrir → INGRESA TU CLAVE_DESPLIEGUE UNA SOLA VEZ
#    - ✅ CHEQUEO DEFINITIVO: NO DEBE APARECER LA BARRA DE URL DE CHROME EN NINGÚN MOMENTO.
#         Si aparece, volvé al paso 4 (el assetlink no validó).
```

---

## 🎁 Extras que ya están listos

### CI builds automáticos (opcional pero MUY recomendado)

Cuando quieras subir el APK a un Release de GitHub sin armarlo en tu compu:

1. Ir a **Settings → Secrets and variables → Actions** del repo.
2. Agregar estos secretos (el alias es opcional, las dos password son IGUALES por defecto):

   | Secreto | Valor |
   |---|---|
   | `ANDROID_KEYSTORE_B64` | `base64 -w0 tango-cifrado-apk/android.keystore` (el output entero, ~3.6KB) |
   | `ANDROID_KEYSTORE_PASSWORD` | `TangoCifrado-Sandbox-2026!` |

3. **Para disparar un build manual:** Actions → build-twa-apk → Run workflow.
   **Para hacer un release con tag:**
   ```bash
   cd /ruta/al/repo
   git tag -a apk/v1.0.0 -m "APK TWA v1.0.0 — primer release"
   git push origin apk/v1.0.0
   ```
4. El workflow sube el `.apk` + `.aab` como:
   - Artifact del workflow (30 días retention, siempre)
   - **Assets de GitHub Release** (cuando el trigger fue un tag `apk/v*`)

### Cuándo volvé a correr build-apk.sh

**NO CADA VEZ QUE CAMBIE LA PWA.** La TWA es solo un wrapper que carga la
URL de Pages — todos los cambios a `app.js`, `cipherEngine.js`, corpus,
íconos de la PWA, textos, flujos, etc. se actualizan automáticamente en los
dispositivos sin tocar el APK.

Solo hacé un APK nuevo SI cambiaste alguna de ESTAS cosas (recursos nativos,
bakeados por Bubblewrap):

| ¿Qué cambiaste? | ¿Necesito nuevo APK? |
|---|---|
| Color `themeColor`, `backgroundColor` (de la app nativa) | ✅ Sí |
| Ícono de launcher (el que aparece en el home de Android) | ✅ Sí |
| Nombre de la app visible en el launcher / multitarea | ✅ Sí |
| `package_name`, `host`, `startUrl` | ✅ Sí (+ volver a publicar assetlinks + reinstalar TODO) |
| `targetSdkVersion`, `minSdkVersion` | ✅ Sí (Play Store obliga cada año; sideload es opcional) |
| Cualquier cosa en `app.js`, `cipherEngine.js`, `index.html`, CSS, textos, flujos | ❌ No |
| Agregar tangos nuevos al corpus / cambiar SALT / cambiar `encrypted-bundle.json` | ❌ No |
| Arreglar bug en el cifrado | ❌ No |
| Cambiar cualquier cosa del servicio web / Pages | ❌ No |

---

## Resumen troubleshooting rápido

| Síntoma | Causa probable | Solución |
|---|---|---|
| Bubblewrap se cuelga sin hacer nada (sin output) | Está esperando entrada de teclado ("Do you want to install JDK?") | Tenés una versión vieja del script. Volvé a copiar [build-apk.sh](file:///root/JOB-sda2/CIFRADO-TANGOS/Tango/scripts/apk/build-apk.sh) del repo o añadí `CI=true` + `{ printf 'n\nn\n'; } | bubblewrap build` |
| Build APK falla con Gradle crash / out of memory | Poca RAM en la máquina o falta JDK 17+ | Instalá JDK 17 o 21 y 8GB RAM mínimos. |
| El APK se instala pero al abrir **veo la barra de Chrome** arriba de todo | Digital Asset Links NO validó | Volvé a correr el paso 4 (verificación Google oficial) y asegurate de que Pages sirva el `assetlinks.json` con `Content-Type: application/json`. |
| Al abrir la app pide `CLAVE_DESPLIEGUE` en CADA arranque | El service worker o IndexedDB no se inicializa correctamente offline | Esperá 10s la primera vez, después cerrá y volvé a abrir. Problemas de red en el primer arranque suelen generarlo. |
| Actualicé `app.js` y no veo el cambio en el wrapper | Service worker con cache | Podés esperar 24h (Google SW actualiza en idle), o abrir la TWA, forzar 3 re-aperturas y cerradas seguidas, o subir un APK nuevo (no es necesario — ya lo expliqué arriba). |
