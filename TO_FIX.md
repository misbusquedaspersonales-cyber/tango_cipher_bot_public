# TO_FIX — Pending Tasks

## Progress Summary

| Priority | Total | Done | Pending |
|---|---|---|---|
| 🟢 P3 (Low) | 1 | 0 | 1 |
| 🔵 P4 (Refactor) | 1 | 0 | 1 |
| **Total** | **2** | **0** | **2** |

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
