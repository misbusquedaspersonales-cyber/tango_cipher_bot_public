# Próximos Pasos — APK TWA (Fase 9)

## Estado actual (2026-08-03, post-regeneración de keystore)

| Artefacto | Estado | Nota |
|---|---|---|
| `tango-cifrado-apk/android.keystore` | ✅ Generada con contraseña real | RSA-2048, validez 10000 días |
| `tango-cifrado-apk/keystore-password.txt` | ✅ En disco, modo 0600, gitignoreado | Contiene la contraseña real |
| `tango-cifrado-apk/twa-manifest.json` | ✅ En repo | packageId=com.tangocifrado.app |
| `.well-known/assetlinks.json` | ✅ Publicado en GitHub Pages | SHA-256 nuevo (ver abajo) |
| `pwa/.well-known/assetlinks.json` | ✅ Publicado en GitHub Pages | Idéntico al anterior |
| `pwa/manifest.json` | ✅ URLs absolutas | Requerido por TWA |

**SHA-256 activo (keystore real):**
```
37:9D:88:CF:A5:60:AC:58:48:91:88:E2:1A:39:F1:4D:7B:E6:33:C5:80:65:1D:43:68:07:38:E7:47:3A:E5:39
```

**Package name:** `com.tangocifrado.app`

> ⚠️ La keystore previa (sandbox, SHA-256 `13:E4:E0:6B:...`) está quemada —
> su contraseña (`TangoCifrado-Sandbox-2026!`) fue expuesta en logs y docs.
> La nueva keystore fue generada interactivamente con una contraseña real que
> nunca apareció en ningún export. Los `assetlinks.json` publicados ya tienen
> el nuevo fingerprint.

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
   37:9D:88:CF:A5:60:AC:58:48:91:88:E2:1A:39:F1:4D:7B:E6:33:C5:80:65:1D:43:68:07:38:E7:47:3A:E5:39
```

Si perdés la keystore o su contraseña, tenés que generar una nueva identidad
de app y todos los usuarios deben desinstalar y reinstalar el APK.

---

## Lo único que falta correr

### Paso 1 — Verificar assetlinks con Google (OBLIGATORIO antes de buildear)

```
https://developers.google.com/digital-asset-links/tools/generator

Domain:              misbusquedaspersonales-cyber.github.io
App package name:    com.tangocifrado.app
SHA-256 fingerprint: 37:9D:88:CF:A5:60:AC:58:48:91:88:E2:1A:39:F1:4D:7B:E6:33:C5:80:65:1D:43:68:07:38:E7:47:3A:E5:39
```

Click "Test statement" → tiene que aparecer ✅ Success.
Si no: esperá 60s a que Pages termine el deploy y reintentá.

También podés verificar con curl:
```bash
curl -s "https://misbusquedaspersonales-cyber.github.io/tango_cipher_bot_public/.well-known/assetlinks.json"
# → debe mostrar el SHA-256 37:9D:88:CF:... arriba
```

### Paso 2 — Instalar dependencias (una sola vez)

```bash
chmod +x scripts/apk/*.sh
./scripts/apk/install-deps.sh
# Instala: Node.js 20, JDK 17, @bubblewrap/cli
```

### Paso 3 — Generar una nueva keystore FUERA del workspace

> ⚠️ Existe una herramienta que genera exports del workspace (`Tango_compact.txt`
> u otro dump) que lee el filesystem directamente sin respetar `.gitignore`.
> Dos keystores anteriores fueron expuestas por este mecanismo. Generá la
> keystore en `~/tango-signing/`, fuera del workspace, para evitar el leak.

```bash
mkdir -p ~/tango-signing
cd ~/tango-signing
/root/JOB-sda2/CIFRADO-TANGOS/Tango/scripts/apk/generate-keystore.sh
# Escribe ~/tango-signing/android.keystore y ~/tango-signing/keystore-password.txt
```

Luego regenerar los assetlinks con la nueva keystore:
```bash
KEYSTORE_FILE=~/tango-signing/android.keystore \
  /root/JOB-sda2/CIFRADO-TANGOS/Tango/scripts/apk/generate-assetlinks.sh
# Actualiza .well-known/assetlinks.json y pwa/.well-known/assetlinks.json
cd /root/JOB-sda2/CIFRADO-TANGOS/Tango
git add .well-known/assetlinks.json pwa/.well-known/assetlinks.json
git commit -m "deploy(assetlinks): new keystore fingerprint"
git push
```

### Paso 4 — Buildear el APK

```bash
cd tango-cifrado-apk
KEYSTORE_FILE=~/tango-signing/android.keystore \
  ../scripts/apk/build-apk.sh
```

- La primera vez descarga ~2-5 GB (Android SDK + Gradle). Las siguientes toman ~15s.
- Los `.apk` y `.aab` quedan en `../dist/apk/`.

### Paso 5 — Probar sideload en Android real

1. Pasar `dist/apk/app-release-signed.apk` al teléfono (Telegram, USB, etc.)
2. Abrir el archivo → Android pide habilitar "Fuentes desconocidas" → habilitar
3. Instalar → abrir
4. **✅ Chequeo definitivo:** NO debe aparecer la barra de URL de Chrome.
   Si aparece → el assetlinks no validó → volver al Paso 1.

---

## CI automático (opcional — configurable en GitHub Actions)

Para buildear el APK desde GitHub Actions sin tener la keystore en tu máquina:

1. Generar el base64 de la keystore:
   ```bash
   base64 -w0 tango-cifrado-apk/android.keystore
   ```

2. En **Settings → Secrets and variables → Actions** del repo, agregar:

   | Secreto | Valor |
   |---|---|
   | `ANDROID_KEYSTORE_B64` | el output del comando base64 arriba |
   | `ANDROID_KEYSTORE_PASSWORD` | tu contraseña real (la que escribiste en generate-keystore.sh) |

3. Disparar build manual: Actions → build-twa-apk → **Run workflow**

4. Para hacer un release con tag:
   ```bash
   git tag -a apk/v1.0.0 -m "APK TWA v1.0.0"
   git push origin apk/v1.0.0
   ```
   El workflow sube el `.apk` + `.aab` como assets del release automáticamente.

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
| Gradle crash / out of memory | Poca RAM o JDK incorrecto | Instalar JDK 17 o 21; mínimo 8 GB RAM disponible. |
| APK instala pero pide CLAVE_DESPLIEGUE cada vez | SW o IndexedDB no inicializado en primer arranque | Esperar 10s, cerrar y reabrir. Es normal solo la primera vez. |
