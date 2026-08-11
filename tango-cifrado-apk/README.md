# tango-cifrado-apk — Proyecto TWA (Trusted Web Activity)

Wrapper Android mínimo que envuelve la PWA de Tango Cifrado. El APK no
contiene lógica propia — solo abre `https://misbusquedaspersonales-cyber.github.io/tango_cipher_bot_public/pwa/index.html`
en pantalla completa sin barra de navegador, verificada mediante Digital
Asset Links.

## Qué hay en esta carpeta

| Archivo | Descripción |
|---|---|
| `README.md` | Este archivo |
| `twa-config.json` | Valores por defecto para `bubblewrap init` (package name, colores, URL del manifest). |
| `.gitignore` | Ignora build artifacts, keystore y Gradle caches (nunca commitear `android.keystore`). |

## Configuración recomendada

- **Package name:** `com.tangocifrado.app` (editable en `twa-config.json` — ¡cambiarlo ANTES del primer build para no romper la identidad de la app!)
- **App name:** `Tango Cifrado`
- **Host:** `misbusquedaspersonales-cyber.github.io`
- **Start path:** `/tango_cipher_bot_public/pwa/index.html`
- **Color de splash / background:** `#1a110f` (coincide con `background_color` del manifest de la PWA)

## Ciclo de vida de actualizaciones

- **Cambios en la PWA (app.js, cipherEngine.js, UI, textos):** NO requieren nuevo APK. La TWA apunta a GitHub Pages — los usuarios reciben el update automáticamente al abrir la app, igual que la PWA en el navegador.
- **Cambios en el WRAPPER Android (ícono, nombre, package name, versión mínima de Android, permisos):** SÍ requieren generar un nuevo APK y redistribuirlo. La mayoría de los updates entran en la primera categoría.

## Flujo rápido (una vez instalado Node.js + JDK 17+)

```bash
# 1. Instalar Bubblewrap (una sola vez)
npm install -g @bubblewrap/cli

# 2. Generar keystore (UNA SOLA VEZ — guardar android.keystore + contraseña)
../scripts/apk/generate-keystore.sh

# 3. Inicializar el proyecto TWA (usa twa-config.json para defaults)
bubblewrap init --manifest=https://misbusquedaspersonales-cyber.github.io/tango_cipher_bot_public/pwa/manifest.json

# 4. Obtener fingerprint SHA-256 y generar assetlinks.json
../scripts/apk/generate-assetlinks.sh
#   → copiar el output a  ../.well-known/assetlinks.json (o ../pwa/.well-known/)
#   → pushear al repo público para que GitHub Pages lo sirva en /.well-known/assetlinks.json

# 5. Verificar con Google
#    https://developers.google.com/digital-asset-links/tools/generator

# 6. Compilar APK
../scripts/apk/build-apk.sh

# 7. Sideload en el teléfono: enviar app-release-signed.apk → instalar → abrir.
#    ✅ Confirmar que NO aparece la barra de URL de Chrome (si aparece, falló el assetlinks).
```

Guía completa y paso a paso en `../PASOS_APK.md` (hermano de esta carpeta).
