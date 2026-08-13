# tango-cifrado-apk — Proyecto TWA (Trusted Web Activity)

Wrapper Android mínimo que envuelve la PWA de Tango Cifrado. El APK no
contiene lógica propia — solo abre `https://misbusquedaspersonales-cyber.github.io/tango_cipher_bot_public/pwa/index.html`
en pantalla completa sin barra de navegador, verificada mediante Digital
Asset Links.

## Estado actual (2026-08-13)

✅ Todo el scaffolding está implementado. **Solo necesitás correr `build-apk.sh`
en tu máquina** (este entorno no tuvo espacio libre para ~5 GB de Android
SDK + Gradle, y los builds locales usan el Android SDK que ya instaló
`install-deps.sh`).

Artefactos que **ya existen** en el repo (no tenés que volver a generarlos):

| Archivo | Descripción | Cómo se regenera si lo querés renovar |
|---|---|---|
| `twa-config.json` | Defaults para `bubblewrap init` (package name, colores, host, start URL). | A mano: editá el JSON directo. |
| `twa-manifest.json` | Config generada por Bubblewrap en el primer `bubblewrap init` local. Si cambiás host/package/colores, corré `bubblewrap init` de nuevo o editá directo y luego `bubblewrap update` (dentro de esta carpeta). | `../scripts/apk/build-apk.sh` — si no existe, dispara `bubblewrap init` solo. |
| `.gitignore` | Ignora `android.keystore`, builds Gradle, y **`app/src/main/res/values/strings.xml` + `colors.xml`** (con explicación de riesgo de stubs — ver TO_FIX M-2). | No regenerar. Añadir excepciones con `!` al final. |

Artefactos de identidad de firma — existen en **TU entorno local**, NO versionados (ver `NEXTPASOS_APK.md` sección "Backup inmediato"):

| Archivo (en `~/tango-signing/`) | Descripción | Riesgo si se pierde |
|---|---|---|
| `android.keystore` | Clave RSA privada de firma. Nunca compartir. | Nadie puede publicar updates con el mismo `packageName`. Los usuarios tienen que desinstalar y reinstalar el APK. **NO PERDERLO — haces backup ahora.** |
| `keystore-password.txt` | Password del keystore (y de la key individual, por defecto la misma). | Si perdés solo la pass pero tenés el `.keystore`, hay herramientas de cracking de keystore (lento pero factible). Si perdés AMBOS → equivalente a perder la keystore entera. |

## Qué hay en esta carpeta (archivos versionables)

| Archivo / Carpeta | Descripción |
|---|---|
| `README.md` | Este archivo. |
| `twa-config.json` | Valores por defecto para `bubblewrap init` (package name, colores, URL del manifest). |
| `.gitignore` | Ignora build artifacts, keystore y Gradle caches (nunca commitear `android.keystore`). Incluye bloque especial explicativo para `strings.xml` / `colors.xml` (stubs). |
| `app/` / `gradle*` / `settings.gradle` / `gradlew` | Proyecto Android generado por Bubblewrap. **NO VERSIONABLES** — recreados por `bubblewrap init`/`build` desde `twa-manifest.json`. Si aparecen en `git status`, es porque `.gitignore` no los atrapa — abrí un issue. |

## Configuración recomendada (ya aplicada en `twa-manifest.json` si lo generaste)

- **Package name:** `com.tangocifrado.app` (editable en `twa-config.json` — ¡cambiarlo ANTES del primer build para no romper la identidad de la app!)
- **App name:** `Tango Cifrado`
- **Host:** `misbusquedaspersonales-cyber.github.io`
- **Start path:** `/tango_cipher_bot_public/pwa/index.html` (con query param `?src=twa-apk` para analitica liviana si se desea)
- **Color de splash / background:** `#1a110f` (coincide con `background_color` del manifest de la PWA)

## Ciclo de vida de actualizaciones

- **Cambios en la PWA (app.js, cipherEngine.js, UI, textos, corpus nuevo):** NO requieren nuevo APK. La TWA apunta a GitHub Pages — los usuarios reciben el update automáticamente al abrir la app, igual que la PWA en el navegador.
- **Cambios en el WRAPPER Android (ícono, nombre, package name, versión mínima de Android, permisos):** SÍ requieren generar un nuevo APK y redistribuirlo. La mayoría de los updates entran en la primera categoría.
- **Updates del TWA wrapper en CI:** pusheá un tag `apk/v1.x.y` a `main` — el workflow `.github/workflows/build-twa-apk.yml` corre, genera el APK y lo sube como release asset automáticamente, después de pasar el smoke test M-2 (strings.xml reales, no stubs).

## Flujo SUPER-corto (ya tenés los artefactos de identidad creados)

```bash
# Paso 0: si no lo hiciste una sola vez, instalar dependencias
chmod +x ../scripts/apk/*.sh
../scripts/apk/install-deps.sh

# Paso 1: PUBLICAR los assetlinks.json YA GENERADOS en el repo público.
# (Saltéalo si ya lo hiciste — solo es necesario una vez por keystore,
#  es decir NUNCA a menos que regeneres la clave.)
#
# En el checkout del REPO PÚBLICO:
cp -v ../.well-known/assetlinks.json        <repo-publico>/.well-known/assetlinks.json
cp -v ../pwa/.well-known/assetlinks.json    <repo-publico>/pwa/.well-known/assetlinks.json
git commit -am "deploy(assetlinks): com.tangocifrado.app SHA256 90:17:F1:AA"
git push

# Paso 2: Verificación oficial Google (OBLIGATORIO, una sola vez, 30s).
#    https://developers.google.com/digital-asset-links/tools/generator
#    Domain = misbusquedaspersonales-cyber.github.io
#    Package= com.tangocifrado.app
#    Fingerprint= el que imprima: keytool -list -v -keystore ~/tango-signing/android.keystore \
#                                    -alias android -storepass "$(cat ~/tango-signing/keystore-password.txt)"
#    -> Tiene que decir "✅ Success". Si no, esperá 60s (cache Pages) y reintentá.

# Paso 3: BUILDEAR EL APK (una vez, la primera vez baja ~5 GB SDK, ~8-12min).
../scripts/apk/build-apk.sh

# Paso 4: Sideload en el teléfono.
#    Transferir dist/apk/app-release-signed.apk al Android.
#    Habilitar "Fuentes desconocidas" cuando Android lo pida.
#    Instalar → abrir → ingresar CLAVE_DESPLIEGUE una sola vez.
#    ✅ CHEQUEO DEFINITIVO: NO DEBE HABER BARRA DE URL DE CHROME EN NINGÚN MOMENTO.
```

## Guía completa y troubleshooting

- Paso a paso extenso con copy-paste exacto: **[NEXTPASOS_APK.md](../NEXTPASOS_APK.md)** (hermano de esta carpeta).
- Troubleshooting genérico del proyecto: **[TROUBLESHOOTING.md](../TROUBLESHOOTING.md)**.
- Qué hace cada helper script: leé el docstring al principio de cada archivo en `../scripts/apk/*.sh`.

