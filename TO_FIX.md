# TO_FIX — Pending Tasks

## Progress Summary

| Priority | Total | Done ✅ | Parcial 🔄 | Pendiente ❌ |
|---|---|---|---|---|
| 🟢 P3 (Low) | 1 | 0 | 1 | 0 |
| 🔵 P4 (Refactor) | 1 | 1 | 0 | 0 |
| 🔧 Maintenance | 3 | 2 | 0 | 1 |
| 🔧 Chunking edge cases | 2 | 2 | 0 | 0 |
| **Total** | **7** | **5** | **1** | **1** |

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
