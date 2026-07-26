# TO_FIX — Bugs and Problems Identified

List of issues found during codebase review (2026-07-26).
Ordered by priority: P0 (critical) → P3 (low).

## Progress Summary

| Priority | Total | Done | Pending |
|---|---|---|---|
| 🔴 P0 (Critical) | 2 | 2 | 0 |
| 🟠 P1 (High) | 5 | 5 | 0 |
| 🟡 P2 (Medium) | 5 | 5 | 0 |
| 🟢 P3 (Low) | 6 | 2 | 4 |
| **Total** | **18** | **14** | **4** |

---

## 🔴 P0 — CRITICAL (Security / Broken Core Functionality)

### [x] P0-1: CI Workflow Hardcodes `SALT=47` — Production Secret Ignored

- **File**: `.github/workflows/build-encrypted-bundle.yml:46`
- **Problem**: The workflow passes `--salt 47` as a CLI flag instead of reading `${{ secrets.CIFRADO_SALT }}`. The README, CHANGELOG, ROADMAP, and `PASOS_PROYECTO_CIFRADO_TANGOS.md:116` all explicitly state that `DEFAULT_SALT=47` is a **development-only placeholder** and that production must use `CIFRADO_SALT` from GitHub Secrets.
- **Impact**: Every public bundle produced by CI uses the exact SALT value published in the docs. If `tangos.json` is ever leaked, tango IDs are trivially unmasked (subtract 47). This directly contradicts the zero-knowledge / two-repo architecture of Fase 3.
- **Fix**:
  ```yaml
  # Line 41–47 in .github/workflows/build-encrypted-bundle.yml
  env:
    CLAVE_DESPLIEGUE: ${{ secrets.CLAVE_DESPLIEGUE }}
  run: |
    python3 scripts/build_encrypted_bundle.py \
      --tangos tangos.json \
      --salt ${{ secrets.CIFRADO_SALT }} \
      --out pwa/encrypted-bundle.json
  ```
  Also add `CIFRADO_SALT` as a required secret in the private repo (it's already documented in ROADMAP.md as required, just not used).

---

### [x] P0-2: `tests/test_cipher_engine.py` Cannot Be Imported (24 dead tests)

- **File**: `tests/test_cipher_engine.py:3`
- **Error**:
  ```
  ModuleNotFoundError: No module named 'cipher_engine'
  ```
- **Problem**: The test imports `from cipher_engine import ...` as a top-level module. In this public repo, `cipher_engine.py` lives inside `private_core/` (vendored clone of the private repo, set up by `scripts/setup_private_core.sh`). `main.py` correctly imports via `from private_core.cipher_engine import ...` but the test doesn't adjust `sys.path` or use the same path.
- **Impact**: 24 tests in this file are **dead in the public repo**. The README claims "37 tests" but only 13 Python + 15 JS = 28 actually run.
- **Fix** — add path handling at the top of the test file:
  ```python
  import os
  import sys
  import pytest

  sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
  from private_core.cipher_engine import cifrar_mensaje, descifrar_mensaje, iter_tangos, DEFAULT_SALT
  ```
  *(Note: `sys.path` adds the **project root**, then import via `private_core.` namespace — this mirrors `main.py`'s own `from private_core.cipher_engine import ...` pattern, so both agree on where the vendored module lives.)*

---

## 🟠 P1 — HIGH (Broken Tests / Security Degradation / Correctness)

### [x] P1-1: PWA E2E Test Broken — Missing `version` Field in Bundle

- **File**: `tests/pwa_e2e.test.mjs:29-47` (`makeBundle` helper)
- **Error**:
  ```
  Error: Versión de bundle no soportada: undefined. Esta versión de la app solo entiende: 1.
  ```
- **Problem**: The `makeBundle()` factory constructs a bundle object for the E2E test but omits the `version: 1` field. `unlockDeployBundle()` in `secure-vault.js:95` checks `SUPPORTED_BUNDLE_VERSIONS = [1]` and rejects anything without a matching version.
- **Impact**: The single E2E test that covers unlock → save → cipher/decipher pipeline always fails. The feature was added to CHANGELOG as tested but never actually worked.
- **Fix** — add the version field to `makeBundle()`'s return object:
  ```javascript
  return {
    version: 1,
    kdf: 'PBKDF2-HMAC-SHA256',
    kdf_salt_b64: bytesToB64(kdfSalt),
    kdf_iterations: 600000,
    nonce_b64: bytesToB64(nonce),
    aad: new TextDecoder().decode(aad),
    ciphertext_b64: bytesToB64(new Uint8Array(ciphertext)),
  };
  ```
  Note: Also verify the `aad` string matches between the test factory (`'tango-cifrado-deploy-aad'`) and `build_encrypted_bundle.py:69` / `secure-vault.js:108` (`'tango-cifrado-bundle-v1'`). They currently **differ** — the E2E test AAD is wrong, which means even after fixing the `version` field, decryption will fail GCM AAD verification. Use `"tango-cifrado-bundle-v1"` in the test to match production.

---

### [x] P1-2: PWA E2E Test — Wrong AAD String (GCM Mismatch)

- **File**: `tests/pwa_e2e.test.mjs:36`
- **Problem**: Test factory writes `aad = 'tango-cifrado-deploy-aad'`. Production code uses `AAD = b"tango-cifrado-bundle-v1"` (`build_encrypted_bundle.py:69`) and `aad = bundle.aad` in `secure-vault.js:108`, which comes from the same string in real bundles. GCM authentication binds the ciphertext to AAD — mismatch means decryption fails with tag error.
- **Impact**: After fixing P1-1, the test will still fail until AAD is aligned.
- **Fix**: Use `'tango-cifrado-bundle-v1'` as the AAD string in `makeBundle()`.

---

### [x] P1-3: Fallback PBKDF2 Uses `iterations=1` — Pointless as a Slow KDF

- **File**: `pwa/cipherEngine.js:30-33`
- **Code**:
  ```javascript
  const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: enc.encode(String(tokenIndex)), iterations: 1, hash: 'SHA-256' },
      keyMaterial,
      length * 8
  );
  ```
- **Problem**: CHANGELOG correctly motivated the switch from 1-byte XOR to PBKDF2: "needs both SALT and token position to brute-force." But `iterations=1` means this is effectively `HMAC-SHA256(key=SALT, data=tokenIndex)` run once — a fast keyed hash, not a deliberately slow KDF. Each candidate SALT can be tried in nanoseconds per token.
- **Impact**: Minor (real security hinges on `tangos.json` staying private, not on fallback bruteforce resistance). But the stated rationale in CHANGELOG for the upgrade is largely defeated.
- **Note**: The Python `cipher_engine.py` (in private repo) likely has the same `iterations=1` — confirm both sides match before changing.
- **Fix**: Use a modest iteration count (e.g. 10,000) — still sub-millisecond on modern CPUs for short lengths, but meaningfully slower per brute-force guess. Both engines must use the same value for round-trip compatibility.

---

### [x] P1-4: Cross-Message Fallback Keystream Reuse (Two-Time-Pad Class)

- **File**: `pwa/cipherEngine.js:25-48` — `deriveKeystream(salt, tokenIndex, length)`
- **Problem**: Keystream depends **only on `(salt, tokenIndex, length)`**, not on a per-message nonce or the chosen tango ID. If two messages use (or start at) the same token index, the fallback `#hex` tokens at matching positions are XORed with **identical keystreams**. Same flaw applies to punctuation `~hex`.
- **Concrete attack**: Alice sends two messages using Tango #3. Msg1 token 2 = "Pedro" (fallback), Msg2 token 2 = "Pablo" (fallback). An attacker XORs the two ciphertext bytes → keystream cancels out → `Pedro XOR Pablo` is left, which is solvable by frequency / crib-dragging just like a reused OTP.
- **Impact**: If a user sends many short messages with predictable structure (greetings, common words), unknown words can be recovered from pairs of aligned fallback tokens.
- **Fix** — mix the masked tango key + (optionally) a per-message counter into the KDF salt:
  ```javascript
  // Before deriveKeystream — pass a "context" combining tango key + position:
  async function deriveKeystream(salt, maskedKey, tokenIndex, length) {
      const saltStr = `${maskedKey}:${tokenIndex}`;  // unique per (msg, token)
      ...
      const bits = await crypto.subtle.deriveBits(
          { name: 'PBKDF2', salt: enc.encode(saltStr), ... },
          ...
      );
  }
  ```
  Apply the same symmetric fix in `cipher_engine.py` in the private repo. Existing messages will NOT decrypt — this is a ciphertext-format breaking change, so bump a "cipher version" indicator if needed, or document it as acceptable since the project is still pre-1.0.

  Residual caveat: this is strong but not airtight for the very first token of a message. If the first token is an out-of-corpus word, the context string is still empty at that point and two different messages could share the same keystream at position 0. Everything after position 0 is protected because the context diverges immediately. This is minor and becomes less relevant as the corpus grows.

---

### [x] P1-5: No Unicode Normalization for `CLAVE_DESPLIEGUE`

- **Files**:
  - `scripts/build_encrypted_bundle.py:74` → `clave_despliegue.encode("utf-8")`
  - `pwa/secure-vault.js:70` → `new TextEncoder().encode(passphrase)`
- **Problem**: Neither side applies Unicode normalization before hashing the deploy key. A password containing `ñ` (U+00F1, composed NFC — typical on Linux/Windows) vs `n + ˜` (U+006E U+0303, decomposed NFD — typical on macOS/iOS) will produce two different PBKDF2 inputs → two different AES keys.
- **Impact**: Same password typed on different OS/devices can fail unlock with "clave incorrecta" and the user has no debug path.
- **Fix** — normalize both sides to NFKC:
  ```python
  # Python (build_encrypted_bundle.py and decrypt_bundle_cli.py)
  import unicodedata
  def derivar_clave(clave_despliegue: str, kdf_salt: bytes) -> bytes:
      clave_nfkc = unicodedata.normalize('NFKC', clave_despliegue)
      return hashlib.pbkdf2_hmac("sha256", clave_nfkc.encode("utf-8"), ...)
  ```
  ```javascript
  // JS (secure-vault.js:69 deriveAesKey)
  async function deriveAesKey(passphrase, saltBytes, iterations) {
      const passNormalized = passphrase.normalize('NFKC');
      const passBytes = new TextEncoder().encode(passNormalized);
      ...
  }
  ```
  **Breaking change** for existing deployments — existing bundles must be re-encrypted with the new NFKC-normalized key derivation, or a "try NFC then NFD" fallback approach can be used on decrypt for backward compat.

---

## 🟡 P2 — MEDIUM (Operational / DX / Edge Cases)

### [x] P2-1: Telegram 4096-Character Limit — Unhandled

- **Files**:
  - `telegram_client.py:13-17` → returns `False` on non-200, but 400 (oversized) gives no specific message.
  - `pwa/app.js:75-83` → generic `Error("Telegram respondió con error ${resp.status}")`.
- **Problem**: Telegram's `sendMessage` caps at 4096 UTF-8 characters. Long articles or messages with many fallback tokens produce ciphertext over this limit. The error gives no indication *why* sending failed. No chunking, no upfront estimation.
- **Fix**:
  1. Before encrypting or sending, estimate ciphertext length (or measure after encrypt) → warn / split.
  2. On HTTP 400 response, parse Telegram's JSON `description` field and surface it to the user.
  3. Add a utility that splits the ciphertext into ≤4096-byte chunks with a continuation marker (e.g. `1/3`, `2/3`) so the receiver can reassemble.

---

### [x] P2-2: Pre-Commit Hook Is Opt-In — Not Auto-Installed

- **File**: `hooks/pre-commit`
- **Problem**: The hook that prevents committing `private_core/` (the **single most important security boundary** in the project) requires the user to run `git config core.hooksPath hooks` manually. This step is documented only as a comment inside the hook file itself — it's not mentioned in README setup steps.
- **Impact**: A new developer clones the repo, skips the step, runs `git add -A --force` or has a `.gitignore` mishap → the **entire secret corpus + cipher engine gets committed to the public repo**.
- **Fix**:
  1. Add the `git config core.hooksPath hooks` instruction **at the top of the Setup section in README.md**, before any install steps.
  2. Optionally add `scripts/bootstrap.sh` that runs this + creates venv + installs deps in one command.
  3. Also add a CI check in the public repo workflow that fails the build if `private_core/**` ever appears in `git ls-files` (belt-and-suspenders).

---

### [x] P2-3: `package.json` Missing Dependencies

- **File**: `package.json`
- **Problem**: `tests/pwa_e2e.test.mjs:6` does `await import('fake-indexeddb')` but `package.json` has **no `devDependencies`** field. `npm test` without a manual `npm install fake-indexeddb` fails.
- **Current `package.json`**:
  ```json
  {
    "type": "module",
    "scripts": {
      "test": "node --test tests/"
    }
  }
  ```
- **Fix**:
  ```json
  {
    "type": "module",
    "scripts": {
      "test": "node --test tests/"
    },
    "devDependencies": {
      "fake-indexeddb": "^6.0.0"
    }
  }
  ```
  Run `npm install` to regenerate `package-lock.json`.

---

### [x] P2-4: Stale `pwa/encrypted-bundle.json` Committed in Public Repo

- **File**: `pwa/encrypted-bundle.json`
- **Problem**: The file is checked in to version control, and there's no indication when it was last regenerated or with which parameters. The CI workflow uploads it as a 7-day artifact but recommends a **manual copy step** into the public repo (line 67–70 comments in the workflow). That manual boundary is likely to drift — the committed file will be weeks/months behind the private `tangos.json`.
- **Impact**: A new user cloning the public repo and opening the PWA locally uses a stale bundle. If the corpus/SALT changed, ciphertext from the CLI (which uses the latest private corpus) won't decrypt in the PWA, and vice-versa.
- **Fix**:
  1. Add a CI step that auto-commits the new bundle to the public repo using a **scoped deploy PAT** (the workflow already outlines this as optional — make it mandatory or document the drift risk clearly).
  2. Include a `generated_at` ISO timestamp in the bundle JSON schema (bump `version` to 2, add the field as optional). The PWA can then display "Bundle actualizado el DD/MM/AAAA" on the settings screen so the user knows it's stale.

---

### [x] P2-5: Service Worker Cache Version Bump Is Manual & Easy to Forget

- **File**: `pwa/service-worker.js:21`
  ```javascript
  const CACHE_VERSION = "tango-cifrado-v1";
  ```
- **Problem**: Every deploy that changes shell files (`SHELL_FILES` list — app logic, cipher fixes, style tweaks) must manually bump this string. Because the shell uses **cache-first**, a forgotten bump means installed PWAs serve old code **permanently** (the browser has no way to know files changed). The activate handler also only cleans old versions if the string differs.
- **Fix**:
  1. Generate `CACHE_VERSION` at build time from the CI commit SHA or a timestamp.
  2. If there's no build step, document the bump requirement as a PR checklist / in CONTRIBUTING (doesn't exist yet, but could live in CHANGELOG as a reminder).
  3. Consider adding `cache: "no-cache"` header to the fetch fallback so on repeat visits it eventually revalidates even without a version bump.

---

## 🟢 P3 — LOW (Docs / Claims / Edge)

### [x] P3-1: Test Count Claims Don't Match Reality

| Source | Claimed | Actual |
|---|---|---|
| README.md:32 | "37 tests" | **64** (45 Python + 19 JS; current runnable test count)
| CHANGELOG.md:29 | "44 Python + 15 JS = 59 tests" | **64** (45 Python + 19 JS)

The documentation now reflects the current runnable test suite.

---

### [ ] P3-2: PIN-Gated Layer-2 Vault Implemented but Never Wired In

- **Files**:
  - `pwa/secure-vault.js:131-186` — `sealForDevice(pin, payload)` + `openDeviceVault(pin, sealed)` exist and look correct (random pin_salt, random nonce, AAD-bound AES-GCM, 600k PBKDF2 iterations).
  - `pwa/app.js:28,112,275` — exclusively uses `savePayloadDirect` / `loadPayloadDirect` which writes plain JSON to IndexedDB.
- **Problem**: The project has two security postures — one implemented, one only available by rewriting `app.js` imports. The installed PWA literally says "Sin contraseña" on the unlock hint. This is a **conscious trade-off** per the long comments in `secure-vault.js:19-34,229-241`, and that's fine. But the docs' "Zero-Knowledge" / "cero-conocimiento" claim (ROADMAP.md, `PASOS_PROYECTO_CIFRADO_TANGOS.md:9-10`) is **false for a stolen device**. Anyone with filesystem/IndexedDB read access (dev tools, rooted Android, iTunes backup of iOS, browser profile copy) gets the full corpus + SALT in plaintext.
- **Fix**: Either:
  - Remove or qualify the "cero-conocimiento / zero-knowledge" claim with "Zero-knowledge on the network; at-rest on device depends on PIN option."
  - OR add a settings toggle in the UI that lets users switch between frictionless and PIN-gated storage, making the Layer 2 path actually reachable.

---

### [ ] P3-3: Telegram Credentials Stored Separately in Plain `localStorage`

- **File**: `pwa/app.js:62-73`
- **Problem**: `botToken` + `chatId` are stored via `localStorage.setItem(...)` as plain JSON, separate from the tango vault. In a stolen-device scenario where IndexedDB leaks the corpus + SALT (P3-2), the attacker ALSO gets the Telegram bot credentials — they can not only decrypt all historic messages but also SEND messages impersonating the victim.
- **Fix**: If/when the PIN-gated vault (P3-2) is wired up, store the Telegram config *inside* the sealed vault payload (or encrypt it under the same PIN-derived key) instead of `localStorage`.

---

### [ ] P3-4: Private Repo SHA Pin — No Auto-Update / Audit Path

- **File**: `scripts/setup_private_core.sh:26-27`
  ```bash
  PRIVATE_REPO_URL="https://github.com/misbusquedaspersonales-cyber/tango_corpus_private.git"
  PRIVATE_CORE_COMMIT="c14366ba53f679ecf1e747e62ca49f46ad5d2e04"
  ```
- **Problem**: The commit SHA is a static string. If the private repo receives a critical cipher fix, new tangos, or updated padding verses, someone has to remember to:
  1. Get the new SHA from the private repo.
  2. Edit this script.
  3. Commit to public repo.
  4. Tell every developer to re-run the script.

There's no dependency-pinning tooling (like `pip-tools`, `npm lockfile`, `renovate`, `dependabot`) to alert on or auto-bump this vendored snapshot. The comment at lines 14–15 explains *why* pinning is correct (it is — prevent silent drift), but the operational burden is high.

- **Fix**: Add a **CI job that runs weekly** (on a schedule) to:
  1. Clone the private repo at `HEAD`.
  2. Compute its SHA.
  3. If `PRIVATE_CORE_COMMIT` in the script differs → open a PR or file an Issue to bump it.

---

### [ ] P3-5: Frequency Analysis on Reused Coordinates (Book Cipher Nature)

- **N/A — architectural limitation**.
- **Explanation**: Because it's a book cipher with a small current corpus (7 tangos, ROADMAP Fase 2 target: 20+), the same word in the same tango always maps to the same `VxxPyy`. Reusing the same tango key for many messages leaks:
  - Per-message word frequency patterns (cryptanalytic frequency analysis)
  - Repeated phrases across messages
  - Exact message length in tokens
- **Mitigation roadmap**:
  1. Fase 2 — reach 20+ tangos so the tango ID alone isn't a strong predictor of topic/register.
  2. Optional enhancement: when a word appears in *multiple verses of the same tango*, pick the verse/pair **randomly instead of first match**. `cipherEngine.js:117-128` currently stops on the first occurrence (`if (encontrada) return;` in inner loops). Alternatives multiply the ciphertext space and reduce repeatable coordinates. This change is **backward compatible for decryption** (any valid V/P still maps to the same word when decrypting — decryption doesn't care if the encryptor had multiple choices).

---

### [x] P3-6: `CHANGELOG.md` Claims `build-encrypted-bundle.yml` Root Duplicate Removed

- **Line 18**: "build-encrypted-bundle.yml root duplicate removed to prevent stale/dead workflow drift"
- **Verification**: The root directory has no such file (LS confirms — it's only in `.github/workflows/`). OK. No fix needed, but verify on every PR that a second copy doesn't accidentally get added.

---

## 📋 Quick-Reference: Files Affected per Issue

| Status | Issue | Primary File(s) |
|---|---|---|
| ✅ | P0-1 | `.github/workflows/build-encrypted-bundle.yml` |
| ✅ | P0-2 | `tests/test_cipher_engine.py` |
| ✅ | P1-1 | `tests/pwa_e2e.test.mjs` |
| ✅ | P1-2 | `tests/pwa_e2e.test.mjs` |
| ✅ | P1-3 | `pwa/cipherEngine.js` + `private_core/cipher_engine.py` (private) |
| ✅ | P1-4 | `pwa/cipherEngine.js` + `private_core/cipher_engine.py` (private) |
| ✅ | P1-5 | `scripts/build_encrypted_bundle.py`, `scripts/decrypt_bundle_cli.py`, `pwa/secure-vault.js` |
| ✅ | P2-1 | `telegram_client.py`, `pwa/app.js` |
| ✅ | P2-2 | `README.md`, optionally `.github/workflows/` (add CI check) |
| ✅ | P2-3 | `package.json`, `package-lock.json` |
| ✅ | P2-4 | `.github/workflows/build-encrypted-bundle.yml`, `scripts/build_encrypted_bundle.py` |
| ✅ | P2-5 | `pwa/service-worker.js` |
| ✅ | P3-1 | `README.md`, `CHANGELOG.md` |
| ⬜ | P3-2 | `README.md`, `PASOS_PROYECTO_CIFRADO_TANGOS.md` (qualify claims) |
| ⬜ | P3-3 | `pwa/app.js` (if Layer-2 PIN path is wired) |
| ⬜ | P3-4 | `.github/workflows/` (new scheduled job), `scripts/setup_private_core.sh` |
| ⬜ | P3-5 | `pwa/cipherEngine.js` + `private_core/cipher_engine.py` (private) — pick random verse match |
| ✅ | P3-6 | No action |

---

## ✅ Confirmed Working (No Fix Required)

- AES-256-GCM deploy bundle crypto (Layer 1): `build_encrypted_bundle.py` ↔ `secure-vault.js` parity — verified by `test_build_encrypted_bundle.py` (5/5 passing).
- Lossless round-trip: capitalization `^C`/`^U`, punctuation `~hex`, digit runs → single `#hex` token, Unicode letters. `cipherEngine.test.mjs`: 15/15 passing.
- Defensive decrypt validation (malformed, out-of-range, bad hex, empty input) — throws descriptive errors, never garbage.
- GCM nonce + KDF salt uniqueness across builds — `test_nonce_es_distinto_en_cada_build` passes.
- Telegram client error handling (Timeout, ConnectionError, bad HTTP status) — `test_telegram_client.py`: 8/8 passing.
- GitHub Actions SHAs pinned by commit hash (not floating tags) — prevents supply-chain drift.
- `.gitignore` covers `private_core/`, `.env`, `venv/`.
- iOS PWA standalone meta tags present for correct "Add to Home Screen" behavior.
