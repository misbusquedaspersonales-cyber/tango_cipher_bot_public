# TO_FIX — Pending Tasks

## Progress Summary

| Priority | Total | Done | Pending |
|---|---|---|---|
| 🟢 P3 (Low) | 2 | 1 | 1 |
| 🔵 P4 (Refactor) | 4 | 3 | 1 |
| 🔧 Follow-up (2026-08-01) | 6 | 4 | 2 |
| **Total** | **12** | **8** | **4** |

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

### [x] P3-6: No Cross-Engine Consistency Tests Between Python and JS Cipher Implementations

- **Resolved 2026-08-01.**
- `tests/vectors.json` — 11 shared test cases (6 deterministic, 3 `roundtrip_only`, 2 `error`) using the existing `BASE` fixture corpus. No dependency on `private_core/tangos.json`; safe to commit in the public repo.
- `tests/python/test_cipher_engine.py` — `test_shared_vector` parametrized loop added.
- `tests/js/cipherEngine.test.mjs` — matching `for` loop added. JS: 27 tests (16 fixed + 11 shared-vector loop). Note: `deeplink.test.mjs` (9 tests) and `pwa_e2e.test.mjs` (3 tests) were added later for Fase 7 — total JS is 39, not 30. Grand total with `private_core/` populated: 95 (39 JS + 13 Python always-run + 43 Python needing `private_core/`).
- `.github/workflows/vector-drift-guard.yml` — CI guard: warns on PRs that edit `tests/vectors.json` without also touching `pwa/cipherEngine.js`.

---

## 🔵 P4 — REFACTOR (Structure / Maintainability)

### [x] P4-1: Python Side Has No Package Structure — `private_core` Coupled at Import Level

- **Resolved 2026-08-01.**
- `src/tango_cifrado/corpus.py` — sole file that imports from `private_core.cipher_engine`. All other Python code imports from here.
- `src/tango_cifrado/telegram.py` — implementation moved from root `telegram_client.py`.
- `src/tango_cifrado/cli.py` — interactive CLI logic moved from root `main.py`.
- `main.py` and `telegram_client.py` kept as thin shims for backward compatibility.
- `tests/python/test_telegram_client.py` — `patch` targets updated to `tango_cifrado.telegram.requests.post`.

---

### [ ] P4-2: `app.js` Mixes Three Distinct Concerns in One 500+ Line File

- **File**: `pwa/app.js` — currently **732 lines** (was 629 on 2026-08-01, grown ~100 lines since without the split happening).
- **Problem**: The file handles vault orchestration, the full UI state machine, and Telegram delivery together. It will become hard to navigate as it grows.
- **Proposed split**:
  ```
  pwa/
    core/
      cipherEngine.js   ← unchanged, pure crypto
      vault.js          ← secure-vault.js renamed, unchanged
      telegram.js       ← enviarATelegram() + Telegram config storage
    ui/
      screens.js        ← showScreen(), setStatus(), DOM helpers
      settings.js       ← initSettings(), initSecuritySettings(), updateSecurityPanel()
      composer.js       ← enterComposer(), handleCipherSubmit(), handleSendButton()
    app.js              ← boot sequence only: init(), resolve vault mode, delegate to screens
  ```
- **Key boundary**: `core/` has zero DOM references; `ui/` has zero crypto logic.
- **Note**: `pwa/app.js` was 629 lines on 2026-08-01 when the "~600 lines, revisit" trigger was first hit. Now at 732 lines — the split is overdue. Scheduled before Fase 10.2 (image sending) in the ROADMAP priority order.

---

### [x] P4-3: Test Folder Mixes Python and JS Files Flat

- **Resolved 2026-08-01.**
- `tests/js/` — `cipherEngine.test.mjs`, `pwa_e2e.test.mjs`.
- `tests/python/` — `test_*.py` files + `__init__.py`. (Note: subfolder named `python`, not `py` — `py` is a reserved pytest package name.)
- `package.json` test script updated to `node --test tests/js/*.test.mjs`.
- Import paths in JS tests fixed (`../../pwa/`); `sys.path` in Python tests fixed (`../..` for project root, `../../scripts/ci` for CI scripts).
- All downstream references updated: `README.md`, `TROUBLESHOOTING.md`, `ROADMAP.md`, `drift-check.yml`.

---

### [x] P4-4: `scripts/` Mixes CI-Only and Local-Dev Tools in the Same Folder

- **Resolved 2026-08-01.**
- `scripts/ci/` — `build_encrypted_bundle.py`, `decrypt_bundle_cli.py`.
- `scripts/dev/` — `check_pwa_assets.py`, `setup_private_core.sh`.
- `scripts/aliases/` — unchanged.
- Path references fixed inside moved files (`../../private_core`, `parent.parent.parent/"pwa"`).
- `check-pwa-assets.yml` and all doc references updated to `scripts/dev/check_pwa_assets.py`.
- **`build-encrypted-bundle.yml` run: paths NOT updated** — this workflow runs in the private repo's CI checkout, where the scripts still live at the flat `scripts/build_encrypted_bundle.py` path. The `scripts/ci/` copies in this public repo are reference copies for local tests only; they are not what runs in production CI. Keep both in sync by hand when logic changes. See also: `scripts/ci/build_encrypted_bundle.py` and `decrypt_bundle_cli.py` docstrings.

---

## 🔧 Follow-up Review (2026-08-01)

### [ ] F-6: `deeplink.test.mjs` Tests Duplicate Logic Instead of Importing from `app.js`

- **Added**: 2026-08-01 (session 4), after Fase 7.1 deep-link feature landed.
- **Problem**: `tests/js/deeplink.test.mjs` reimplements `consumeDeepLink()` and `buildSendMessageBody()` as inline copies rather than importing them from `pwa/app.js`. The test file even carries a comment: "must stay in sync with the implementation in pwa/app.js." This is the same two-copies-that-must-be-kept-in-sync pattern flagged for `scripts/ci/build_encrypted_bundle.py` — if someone edits the real function without updating the test copy, tests keep passing while real code silently breaks.
- **Why it happened**: `app.js` uses `document`, `location`, `history`, `navigator` at module scope — importing it in Node without a DOM stub throws immediately. `cipherEngine.js` and `secure-vault.js` are importable directly because they only touch Web Crypto and IndexedDB, both of which can be stubbed. `app.js` can't be imported the same way without a full DOM harness.
- **Fix**: one of two paths:
  1. **Extract** `consumeDeepLink()` and the `reply_markup` builder into a small DOM-free module (e.g. `pwa/deeplink.js`) that `app.js` imports. Then both `deeplink.test.mjs` and `app.js` import the real implementation — zero duplication.
  2. **Stub the DOM** in the test file the same way `pwa_e2e.test.mjs` stubs `indexedDB` and `localStorage`, then import `app.js` for real via `new URL(...)`. More setup, but tests the actual wiring rather than an extracted helper.
- **Option 1 is simpler** and consistent with the `corpus.py` / `telegram.py` split already done on the Python side (P4-1). `deeplink.js` would be ~30 lines and have zero dependencies beyond standard browser APIs.
- **Not urgent**: the current tests are better than nothing and the duplicated logic is simple enough that drift is low-risk in the short term. But fix before app.js grows more testable-but-untested functions.

---

## 🔧 Follow-up Review (2026-08-01)

### [x] F-1: `npm test` Fails on Current Node (Bare Directory Arg Not Discovered)

- **Fix applied**: `package.json` test script → `"node --test tests/js/*.test.mjs"`. Added `"engines": {"node": ">=20.0.0"}`.

---

### [x] F-2: README Setup Never Installs `pytest`

- **Fix applied**: added `pytest` to pip install line. Test count corrected to 64.

---

### [x] F-3: `.env.example` Deploy-Token Entry Was Invalid and Incomplete

- **Fix applied**: renamed to `PUBLIC_REPO_DEPLOY_TOKEN`, added `PRIVATE_REPO_PAT`.

---

### [x] F-4: `check_pwa_assets.py` Docstring Says "Wire It Into CI" — Never Was

- **Fix applied**: new `.github/workflows/check-pwa-assets.yml`.

---

### [ ] F-5: `scripts/check_coverage.py` / `tests/test_check_coverage.py` Are Documented but Absent

- **Files**: referenced in `CHANGELOG.md`; stale `.pyc` bytecode in `__pycache__/`.
- **Status**: not fixed — not recoverable from bytecode alone without risk of silent divergence.
- **Recommendation**: restore from git history or private repo, or remove the dangling `CHANGELOG.md` reference.
