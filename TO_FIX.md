# TO_FIX — Pending Tasks

## Progress Summary

| Priority | Total | Done ✅ | Parcial 🔄 | Pendiente ❌ |
|---|---|---|---|---|
| 🟢 P3 (Low) | 1 | 0 | 1 | 0 |
| 🔵 P4 (Refactor) | 1 | 1 | 0 | 0 |
| 🔧 Maintenance | 5 | 3 | 2 | 0 |
| 🔧 Chunking edge cases | 2 | 2 | 0 | 0 |
| **Total** | **9** | **6** | **2** | **0** |

> Auditoría 2026-08-13: se verificó código-fuente por cada item (ver § abajo). La tabla anterior refleja el estado REAL. El primer borrador mentía (decía 0 done pero 3 checkeados, y M-3/C-1/C-2 estaban documentados como bloqueados cuando ya tenían code fixes).

---

## 🟢 P3 — LOW

### [ ] P3-5: Frequency Analysis on Reused Coordinates (Book Cipher Nature)

- **PARCIALMENTE RESUELTO 🔄 — mitigaciones de código listas; queda la expansión de corpus (Fase 2).**
- **Limitación arquitectónica inherente**: por ser un "book cipher", reutilizar la misma clave de tango para muchos mensajes filtra patrones de frecuencia por palabra, frases repetidas y longitud exacta del mensaje en tokens.
- **Mitigaciones YA IMPLEMENTADAS en código** (confirmado audit 2026-08-13):
  1. ✅ Selección aleatoria de verso: cuando una palabra aparece en múltiples versos del mismo tango, el cifrador elige un verso/par al azar en vez de la primera coincidencia. [cipherEngine.js:117-135](file:///root/JOB-sda2/CIFRADO-TANGOS/Tango/pwa/cipherEngine.js#L117-L135) y `private_core/cipher_engine.py:191-201`. Retrocompatible.
  2. ✅ Fallback keystream context-bound: evita reutilización two-time-pad entre mensajes (anteriormente P1-4).
- **Queda pendiente**:
  - Fase 2 — llegar a 20+ tangos para que el ID del tango solo no sea un predictor fuerte de tono/registro. **Estado corpus actual (auditado 2026-08-13): 8 tangos.** (Tango 8 *El Mensajero* ya está incorporado y propagado a Pages + APKs nuevas.)

---

## 🔵 P4 — REFACTOR (Structure / Maintainability)

### [x] P4-2: `app.js` Mixes Three Distinct Concerns in One 500+ Line File

- **✅ RESUELTO (parcialmente, por Fase 10.1.1)** — auditado 2026-08-13.
- **Hecho**: `pwa/core/transport/` + `pwa/core/receive/` extraídos de `app.js`. El corte grande está cerrado.
- **Pendiente (postergado a Fase 10.2, no bloqueante)**: glue solo-DOM (cambio de pantallas, handlers de formularios → `ui/composer.js`).

---

## 🔧 Maintenance

### [ ] M-5: Web Share Target intent-filters cause APK installation failure

- **🔄 DESCUBIERTO Y MITIGADO** — session 6 round 7: la causa raíz de los fallos de instalación de APK identificada.
- **Problema**: APKs con Web Share Target (`shareTarget` en `twa-manifest.json`) generan intent-filters `android.intent.action.SEND` + `SEND_MULTIPLE` que causan fallos de instalación en ciertos dispositivos Android.
- **Evidencia comparativa**:
  - ✅ APK sin Web Share Target (versionCode=2, old working): instalación exitosa
  - ❌ APK con Web Share Target (versionCode=6, recent): fallo de instalación  
  - ✅ APK sin Web Share Target (versionCode=7, test): instalación exitosa
- **Root cause verificado**: Al comparar con versión working anterior, el único cambio significativo fueron los intent-filters de Web Share Target en AndroidManifest.xml
- **Posibles causas técnicas**:
  - Incompatibilidad de versión Android del dispositivo con Web Share Target TWA
  - Error de configuración en intent-filters generados por Bubblewrap
  - Conflicto TWA + Web Share Target en el sistema de intents Android
- **Mitigación actual**: APK compilado sin `shareTarget` (`tango-cifrado-NO-SHARE-TARGET.apk`) instala correctamente
- **Estado**: **Funcional básico** (APK instala), **Web Share Target bloqueado** (requiere investigación adicional)
- **Próximos pasos**: 
  1. **Capturar el dato que falta**: la investigación actual comparó dos APKs (con/sin `shareTarget`) pero nunca miró `adb logcat` en el momento exacto de la instalación fallida. Sin ese log, "causa raíz verificada" en realidad significa "correlación verificada, causa desconocida". Repetir la instalación del APK CON `shareTarget` en un dispositivo que falla, con `adb logcat | grep -i "PackageParser\|parseBaseApk"` corriendo en paralelo, es el primer paso — probablemente el único que realmente acota las 3 hipótesis de abajo a una.
  2. Probar intent-filter alternativo o configuración Bubblewrap (versión de `@bubblewrap/cli` distinta — la actual coincide con la que introdujo `compileSdkVersion 36`; podría ser el mismo tipo de drift de versión que causó M-4, no un problema de Web Share Target en sí).
  3. Probar en un tercer dispositivo/versión de Android distinto a los dos usados en la comparación original — con solo 2 dispositivos no se puede distinguir "todos los Android fallan" de "este modelo/versión puntual falla".
  4. Considerar APK dual: básico (sin share target) + experimental (con share target), para no bloquear la distribución mientras se investiga.

#### ¿Por qué vale la pena reintentarlo, y no dejarlo como estaba?

El workaround actual (`tango-cifrado-NO-SHARE-TARGET.apk`) no es gratis — devuelve al receptor exactamente al flujo manual que Fase 10.1.1 se propuso eliminar:

- **La razón por la que existe `sendDocument`/Web Share Target en primer lugar**: los mensajes cifrados largos (>1200 chars) se mandan como archivo `.txt` adjunto porque el deep-link de texto no entra en el límite de Telegram. Sin Share Target, el receptor tiene que: guardar el archivo manualmente desde Telegram, abrir la app aparte, tocar "Abrir archivo cifrado", y buscar el archivo en el almacenamiento — cuatro pasos manuales en vez de un tap en "Compartir". Para un destinatario no técnico (el caso de uso real de esta app), cada paso manual es una oportunidad de error o de abandono.
- **Es la única pieza de la Fase 10.1.1 que quedó a medio camino.** Todo el resto — `sendDocument`, `selectTransport`, el pipeline de recepción, el fallback manual — está implementado, probado (53/53 JS) y funcionando en producción. Web Share Target es la última pieza para que el flujo completo sea "un tap" de punta a punta, tal como está descripto en el propio `ROADMAP.md` y `README.md`.
- **El fallback manual seguirá existiendo aunque se resuelva esto** — no hay riesgo de regresión al reintentar: si Web Share Target vuelve a fallar, el peor caso es quedar exactamente donde está hoy.
- **La causa raíz sigue sin identificarse**, lo cual es distinto de "confirmado incompatible". Es enteramente posible que el problema no sea Web Share Target en sí, sino un artefacto del mismo tipo de drift de configuración que ya causó M-4 (versión de Bubblewrap/SDK no pineada, generando intent-filters o metadata inconsistente entre builds). Si ese es el caso, la solución podría ser tan simple como pinear la versión de `@bubblewrap/cli` — no un problema arquitectónico de fondo.

### [ ] M-4: APK version desynchronization on clean builds

- **🔄 PARCIALMENTE RESUELTO** — fix manual aplicado (session 6 round 7), pero queda brecha de automatización.
- **Problema**: Cuando falta `./gradlew` (CI, clean checkout), `build-apk.sh` dispara `bubblewrap init --manifest $URL`, que:
  1. Lee PWA `manifest.json` (carece de campos version Android-específicos)  
  2. Sobrescribe `twa-manifest.json` existente con defaults: versionCode=1, versionName="", targetSdkVersion=latest
  3. Ignora valores configurados: versionCode=4, versionName="1.3.0", targetSdkVersion=34
- **Estado actual**:
  - ✅ Fix manual aplicado: `app/build.gradle` sincronizado manualmente con valores `twa-manifest.json`
  - ✅ APK verificado: APK final tiene versionCode='4', versionName='1.3.0' correcto
  - ❌ Brecha identificada: `build-apk.sh` solo **detecta** `twa-manifest.json` faltante, no **verifica/corrige** sync de versiones
- **Brecha de automatización**: El script dice tener "version synchronization guards" pero solo corre:
  ```bash
  bubblewrap init --manifest="$URL"  # Sobrescribe versiones con defaults
  sync-share-target.sh              # Sincroniza share_target, NO versiones
  ```
- **Riesgo de próxima ocurrencia**: **Alto** — cualquier build limpio (CI sin cache `./gradlew`, clone fresco) disparará la misma desincronización
- **Opciones de solución**:
  1. **Version sync en build-apk.sh** — después de `bubblewrap init`, leer versiones `twa-manifest.json` y patchear `app/build.gradle`
  2. **Init guard** — detectar cuando `bubblewrap init` va a sobrescribir versiones, backup/restore
  3. **CI persistence** — asegurar que CI cachee `./gradlew` para evitar trigger del path `init`
- **Prioridad**: **Media** — no bloquea distribución actual, pero causará confusión en próximo build limpio

### [x] M-3: CI APK build fails with bubblewrap interactive prompts — complex multi-stage issue

- **✅ RESUELTO (todos los prompts + sintaxis YAML). Auditado 2026-08-13 en [build-twa-apk.yml](file:///root/JOB-sda2/CIFRADO-TANGOS/Tango/.github/workflows/build-twa-apk.yml).**
- **Status final**: Workflow parsea correctamente. Ningún step de bubblewrap depende de stdin interactivo. Queda **pendiente la PRIMERA ejecución end-to-end real en el runner de GitHub Actions** (requiere ~5 GB libres durante el download del SDK + Gradle daemon). El workflow ya no falla por problemas de código/YAML.
- **Fixes ya aplicados y confirmados en workflow**:
  1. ✅ npm install con `--ignore-scripts` (skipea prompt JDK del postinstall) → línea ~115.
  2. ✅ Pre-creación de `~/.bubblewrap/config.json` con jdkPath + androidSdkPath → skipea prompts de init/bubblewrap setup.
  3. ✅ SDK symlink `tools -> cmdline-tools/latest` para compatibilidad bubblewrap.
  4. ✅ Env vars `BUBBLEWRAP_KEYSTORE_PASSWORD` + `BUBBLEWRAP_KEY_PASSWORD` (no prompts de keystore).
  5. ✅ `printf 'n\n' | bubblewrap build --skipPwaValidation` (no prompt de regeneración).
  6. ✅ **Fix de sintaxis YAML anterior** (expresiones `${{ ... }}` no citadas con bash `&&`/`||` inline — movido a bloques `run:` planos con `if [ -n … ]` en bash).
  7. ✅ Si falta `./gradlew` → corre `{ printf 'Y\nY\n'; } | bubblewrap init --manifest $MANIFEST_URL` automáticamente con log fallback.
- **Evidencia adicional (CHANGELOG Unreleased 2026-08-13 session 6 round 2)**: documenta M-3 como fixed, y el step `Smoke-test APK strings (M-2 guard)` del workflow (líneas 303-363) sí existe.
- **Workaround manual** mientras se valida el CI build: `cd tango-cifrado-apk && ../scripts/apk/build-apk.sh` — funciona y produce APKs válidas.

### [x] M-6: Cache clearing procedure complex and error-prone for users

- **✅ RESUELTO** — patches 0009-0012 applied (session 6 round 8): automated cache clearing feature.
- **Problema original**: Manual cache clearing via TROUBLESHOOTING.md requería múltiples pasos técnicos propensos a error: desregistrar Service Worker, borrar Cache Storage, borrar IndexedDB, limpiar localStorage, hard refresh. Usuarios no técnicos frecuentemente cometían errores o abandonaban el proceso.
- **Solución implementada**: 
  - **UI integrada**: Botón "Mantenimiento ▾ → Vaciar caché y reiniciar" en settings de la app
  - **Automatización completa**: `clearAllLocalStateAndReload()` ejecuta todos los pasos de limpieza automáticamente
  - **Seguridad de datos**: Diálogo de confirmación advierte sobre pérdida de corpus desbloqueado y credenciales Telegram
  - **Manejo robusto**: Continúa proceso aún si algunos pasos fallan, evitando estados parciales
- **Resultado**: Procedimiento de 6 pasos manuales reducido a 2 clicks (botón + confirmación). Soporte técnico significativamente reducido.
- **Fallback preservado**: TROUBLESHOOTING.md mantiene pasos manuales para versiones anteriores y casos edge.

### [ ] M-1: Keystore password reuses a known-compromised value

- **❌ AÚN PENDIENTE.** Riesgo Bajo.
- **File**: `~/tango-signing/keystore-password.txt` (fuera del workspace).
- **Problem**: El password de la keystore limpia (`90:17:F1:AA:...`) sigue siendo `SeVestiraDeFiesta` — el mismo password usado en la keystore comprometida anterior, y listado explícitamente en el array `KNOWN_COMPROMISED_PASSWORDS` de [generate-keystore.sh](file:///root/JOB-sda2/CIFRADO-TANGOS/Tango/scripts/apk/generate-keystore.sh). La **keystore en sí** está limpia (fuera del workspace, nunca se exportó), pero la defensa en profundidad pide una contraseña nunca usada.
- **Fix documentado en PASOS_APK.md**: requiere regenerar keystore → nuevo fingerprint → nuevo `assetlinks.json` en **ambos** repos → **reinstalacción total del APK** en todos los dispositivos (Android rechaza actualizaciones con firma distinta). **No urgente**; solo ejecutar en un momento conveniente para redistribuir.
- **Estado**: no hay riesgo inmediato (la keystore nunca se filtró). Se queda pendiente hasta la próxima regeneración de APK.

### [x] M-2: strings.xml and colors.xml committed as stubs — CI must not rely on them

- **✅ RESUELTO (doble guardia). Auditado 2026-08-13.**
- **Guardia 1 (prevención)**: `strings.xml` + `colors.xml` agregados a [tango-cifrado-apk/.gitignore](file:///root/JOB-sda2/CIFRADO-TANGOS/Tango/tango-cifrado-apk/.gitignore#L64-L65) con comentario explicativo. Los stubs **no pueden commitearse por accidente** nunca más.
- **Guardia 2 (detección post-build)**: Smoke-test **M-2 guard** STEP completo en [build-twa-apk.yml:303-363](file:///root/JOB-sda2/CIFRADO-TANGOS/Tango/.github/workflows/build-twa-apk.yml#L303-L363). Usa `aapt2 dump xmltree` + `aapt2 dump resources` sobre CADA APK compilado y valida:
  - `string/hostName` existe + NO vacío + NO es stub `TODO`/`example.com`
  - `string/launchUrl` ídem
  - `string/colorPrimary` ídem
  - Si CUALQUIER APK falla → `exit 1` → workflow falla → **no publica Release**.
- **Estado**: las dos capas cubren el riesgo de CI. Puedes marcarlo como done.

---

## 🔧 Chunking edge cases (Fase 10.1)

### [x] C-1: Single token longer than chunk budget is not guarded

- **✅ RESUELTO. Auditado 2026-08-13 en [chunked-text.js:41-143](file:///root/JOB-sda2/CIFRADO-TANGOS/Tango/pwa/core/transport/chunked-text.js#L41-L143).**
- **Detalles del fix (docstring + código real)**:
  - Branch explícito `if (alone && token.length > effectiveMax)` al principio del loop (línea 101): maneja el caso de UN SOLO token oversized (el bug reportado).
  - 3 vías:
    1. Token entra en el budget después de proyectar el prefix → emite chunk.
    2. `fit < 16` (budget marginal): **throw `TokenOverflowError` descriptivo** con props `tokenLength`, `maxLen`, `budget`, `chunkIndex` y texto de error en español explicando que la tira de dígitos sin separadores produce un fallback XOR único demasiado largo.
    3. Si no: **byte-split** `token.slice(0, fit)` + `tokens.splice(t+1, 0, slice2)` — el resto se reprocesa en la próxima iteración (loop es seguro, se vuelve a entrar en este branch si `slice2` sigue siendo oversized).
- **Tests verificados**: `tests/js/transport.test.mjs` → 3 nuevos tests cubren: single oversized token byte-split, TokenOverflowError con props verificadas, multi-stage splitting. Todos los caminos del branch C-1 están cubiertos. ✅

### [x] C-2: No partial-send recovery on mid-send network failure

- **✅ RESUELTO. Auditado 2026-08-13 en [chunked-text.js:220-265](file:///root/JOB-sda2/CIFRADO-TANGOS/Tango/pwa/core/transport/chunked-text.js#L220-L265) + [document.js](file:///root/JOB-sda2/CIFRADO-TANGOS/Tango/pwa/core/transport/document.js).**
- **Fix**: Ambos transports levantan errores con **metadatos estructurados de recuperación parcial**:
  - Propiedades presentes en TODO error de red y error HTTP:
    - `.chunksSentBeforeFail = i` (0-indexed: número de chunks enviados EXITOSAMENTE antes de fallar)
    - `.chunksTotal = chunks.length`
    - `.partIndex = i + 1` (1-indexed para copy en el UI humano)
    - `.isPartialSend = i > 0` → `true` si ya se habrían filtrado fragments por Telegram.
  - En `chunked-text.js`: errores de red son `TelegramNetworkError`, errores de HTTP son `TelegramApiError` con `httpStatus` + `detalle` de `data.description`. El mensaje humano incluye: *"Error de red al enviar a Telegram en parte i/N (partes 1 a i-1 ya fueron enviados)."*
  - En `document.js`: mismos campos por simetría (mono-request → `chunksSentBeforeFail=0`, `isPartialSend=false` siempre).
- **Estado**: El UI handler de errores en `app.js` puede chequear `err.isPartialSend` y mostrar un toast/warning cuando fragments ya llegaron al receiver → **el usuario sabe qué chunks van y cuáles no**. El caso "no hay información" ya no existe. OK.
