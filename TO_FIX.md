# TO_FIX — Pending Tasks

## Progress Summary

| Priority | Total | Done | Pending |
|---|---|---|---|
| 🟢 P3 (Low) | 1 | 0 | 1 |
| 🔵 P4 (Refactor) | 1 | 1 | 0 |
| 🔧 Maintenance | 3 | 0 | 3 |
| 🔧 Chunking edge cases | 2 | 0 | 2 |
| **Total** | **7** | **0** | **7** |

---

## 🟢 P3 — LOW

### [ ] P3-5: Frequency Analysis on Reused Coordinates (Book Cipher Nature)

- **PARTIALLY RESOLVED — code mitigations done; corpus expansion (Fase 2) remains.**
- **Architectural limitation**: Because it's a book cipher, reusing the same tango key for many messages leaks per-message word frequency patterns, repeated phrases, and exact message length in tokens.
- **Mitigations already implemented (code)**:
  1. ✅ Random verse selection — when a word appears in multiple verses of the same tango, the encryptor picks a random verse/pair instead of the first match (`pwa/cipherEngine.js:117-135`, `private_core/cipher_engine.py:191-201`). Backward compatible.
  2. ✅ Context-bound fallback keystream prevents two-time-pad reuse across messages (was P1-4).
- **Remaining**:
  - Fase 2 — reach 20+ tangos so the tango ID alone isn't a strong predictor of topic/register. Currently at 7 tangos.

---

## 🔵 P4 — REFACTOR (Structure / Maintainability)

### [x] P4-2: `app.js` Mixes Three Distinct Concerns in One 500+ Line File

- **Resolved (partially) by Fase 10.1.1**: `core/transport/` and `core/receive/` extracted from `app.js`. The big cut is done. Remaining: DOM-only glue (screen switching, form handlers → `ui/composer.js`) — deferred to Fase 10.2.

---

## 🔧 Maintenance

### [x] M-3: CI APK build fails with bubblewrap interactive prompts — complex multi-stage issue

- **Status**: Currently blocked on YAML syntax error after significant progress resolving bubblewrap prompts
- **Original Problem**: `@bubblewrap/cli` triggers multiple interactive prompts that kill GitHub Actions CI (exit 130 / SIGINT)
- **Root Cause Discovery**: Bubblewrap has cascading prompts at different stages:
  1. **npm install**: JDK installation prompt during postinstall
  2. **bubblewrap init**: JDK/Android SDK configuration prompts  
  3. **bubblewrap build**: Project regeneration + keystore password prompts
  4. **Android SDK structure**: Bubblewrap expects `tools/bin/sdkmanager` but GitHub Actions uses `cmdline-tools/latest/bin/`

**Progress Made (2026-08-13 session)**:
- ✅ **Fixed npm install prompts**: Added `--ignore-scripts` flag to skip postinstall JDK prompt entirely
- ✅ **Fixed JDK/SDK detection**: Created `~/.bubblewrap/config.json` with correct paths, bypassing init prompts
- ✅ **Fixed SDK structure**: Created symlink `tools -> cmdline-tools/latest` for bubblewrap compatibility  
- ✅ **Fixed keystore prompts**: Used env vars `BUBBLEWRAP_KEYSTORE_PASSWORD` and `BUBBLEWRAP_KEY_PASSWORD`
- ✅ **Fixed gradlew missing**: Discovered Android project files aren't committed (only `twa-manifest.json` is in git), so CI needs to regenerate them
- ✅ **Reached actual Gradle build**: Latest successful run got to `./gradlew assembleRelease` before hitting the current blocker

**Current Blocker (as of latest runs)**:
- **YAML syntax error** in `.github/workflows/build-twa-apk.yml` preventing workflow execution
- Error: `syntax error: unexpected end of file` in generated shell script
- Likely caused by malformed multi-line YAML string in the `bubblewrap init` step
- Recent runs fail at workflow parse time, not during bubblewrap execution

**Failed CI Run History**:
- Runs 31666595730-31671758278: Exit 130 (various bubblewrap prompts)
- Runs 31672097922-31674819445: Exit 130 → Exit 1 → back to Exit 130 (prompt handling evolution)
- Runs 31675265825+: YAML syntax errors (current issue)

**Next Steps**:
1. **Immediate**: Fix YAML syntax in workflow file (likely in multi-line string formatting)
2. **Then test**: With YAML fixed, the build should reach Gradle compilation  
3. **If Gradle succeeds**: APK build should complete and auto-upload to GitHub Release
4. **Final validation**: Download APK, install, verify tango 8 "El Mensajero" appears

**Solutions Applied**:
```yaml
# npm install with --ignore-scripts (bypasses postinstall prompts)
npm install -g @bubblewrap/cli@${{ env.BUBBLEWRAP_VERSION }} --ignore-scripts

# Pre-create config file (bypasses init prompts) 
mkdir -p ~/.bubblewrap
printf '{"jdkPath":"%s","androidSdkPath":"%s"}' "$JAVA_HOME" "$ANDROID_SDK_ROOT" > ~/.bubblewrap/config.json

# Fix SDK structure (bubblewrap compatibility)
ln -s "$ANDROID_SDK_ROOT/cmdline-tools/latest" "$ANDROID_SDK_ROOT/tools"

# Environment variables (bypasses keystore prompts)
BUBBLEWRAP_KEYSTORE_PASSWORD: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
BUBBLEWRAP_KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}

# Answer regeneration prompt
printf 'n\n' | bubblewrap build --skipPwaValidation
```

**Priority**: High — blocks APK v1.2.0 release with tango 8 fix. PWA already works with all 8 tangos.
**Impact**: Manual workaround exists (local APK build via `scripts/apk/build-apk.sh`), but CI automation preferred for releases.

### [ ] M-1: Keystore password reuses a known-compromised value

- **File**: `~/tango-signing/keystore-password.txt`
- **Problem**: The password for the clean keystore (`90:17:F1:AA:...`) is `SeVestiraDeFiesta` — the same password that was previously used with the second compromised keystore and is explicitly listed in `generate-keystore.sh`'s `KNOWN_COMPROMISED_PASSWORDS` array. The *keystore file itself* is clean (generated outside the workspace on 2026-08-04, never exported), but the password reuse means anyone who saw the old password could attempt to use it against this keystore if they ever obtained the file.
- **Risk**: Low in practice — the keystore file is at `~/tango-signing/`, outside the workspace and never in any export. But the defence-in-depth argument for a unique password is sound.
- **Fix**: Regenerate the keystore with a fresh password that has never appeared anywhere:
  ```bash
  # Delete the current keystore first (make sure you have the APK backed up)
  rm ~/tango-signing/android.keystore ~/tango-signing/keystore-password.txt
  cd ~/tango-signing
  /root/JOB-sda2/CIFRADO-TANGOS/Tango/scripts/apk/generate-keystore.sh
  # Then regenerate assetlinks.json — the new keystore has a different fingerprint
  cd /root/JOB-sda2/CIFRADO-TANGOS/Tango/tango-cifrado-apk
  ../scripts/apk/generate-assetlinks.sh
  # Push assetlinks to both repos, rebuild and redistribute the APK
  ```
- **Note**: Regenerating the keystore means a new fingerprint → new `assetlinks.json` → new APK build → resend to client. Only do this when there's a convenient moment to redistribute. Not urgent.

### [ ] M-2: strings.xml and colors.xml committed as stubs — CI must not rely on them

- **Files**: `tango-cifrado-apk/app/src/main/res/values/strings.xml` and `colors.xml`
- **Problem**: The committed versions are incomplete stub templates — they only contain `assetStatements` and `shortcut_background`. All other resources that `AndroidManifest.xml` references (`hostName`, `launchUrl`, `fallbackType`, `colorPrimary`, `colorPrimaryDark`) are generated by bubblewrap at build time from `twa-manifest.json` into `app/build/`. Local builds are fine because bubblewrap always regenerates. CI is the risk: if `bubblewrap update` is skipped or fails silently, the build compiles against the stub files and produces a broken APK with no visible error.
- **Fix for CI (Fase 9.3)**: the workflow must run `bubblewrap update` (or `bubblewrap build` which includes update) and verify the checksum in `manifest-checksum.txt` changed as expected before proceeding to Gradle. Alternatively, add a post-build smoke-test that extracts `strings.xml` from the APK and asserts `hostName` is present and non-empty.
- **Immediate fix**: added `strings.xml` and `colors.xml` to `.gitignore` with a comment explaining why, so future readers don't mistake the stubs for real source files.

---

## 🔧 Chunking edge cases (Fase 10.1)

### [ ] C-1: Single token longer than chunk budget is not guarded

- **File**: `pwa/deeplink.js` — `chunkCipherText()`
- **Problem**: The function never refuses to add the *first* token of a new chunk even if that token alone exceeds `effectiveMax`. It only refuses to add a *second* token that would overflow. A single very long token (e.g. a 40+ digit number with no spaces, which gets XOR-encoded as one long `#hex` token) would produce a chunk that exceeds Telegram's 4096-char limit, causing a Telegram API error on that chunk.
- **How to reproduce**: paste a message containing a 200+ digit number with no separators and no spaces (e.g. a hash or base64 string pasted raw). The XOR fallback encodes digit runs as a single `#hex` token — that token alone could exceed any reasonable `effectiveMax`.
- **Fix**: after building each raw chunk, clamp it to `effectiveMax` by byte-slicing on the last `-` boundary that fits. Or: pre-check each token against `effectiveMax` before grouping and raise a descriptive error if a single token exceeds the budget.
- **Priority**: Low — only triggers with extremely long unbroken digit/hash runs. Worth testing before enabling large-message sending in production.

---

### [ ] C-2: No partial-send recovery on mid-send network failure

- **File**: `pwa/app.js` — `enviarATelegram()`
- **Problem**: Chunks are sent sequentially. If the send fails mid-way (network drop, Telegram rate limit), earlier chunks are already in the receiver's chat as useless plaintext fragments — no "Descifrar →" button, no way to decrypt them, and no automatic retry. The sender sees an error message that doesn't say which chunks made it through.
- **How to reproduce**: send a multi-chunk message, kill the network connection after the first chunk is delivered. Observe what the receiver sees and what error the sender gets.
- **Possible fixes**:
  1. On failure, report exactly which chunk failed (`"Error en parte 3 de 5 — las partes 1-2 ya fueron enviadas"`).
  2. Optionally: send a follow-up "cancel" message to the receiver when a partial send is detected, so they know to ignore the fragments.
  3. Full retry: keep track of which chunks were sent and retry from the failed chunk. More complex, probably overkill for now.
- **Priority**: Low for the current two-user use case where retrying manually is trivial. Worth addressing before scaling to more users.
