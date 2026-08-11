/**
 * app.js
 *
 * Wires together secure-vault.js (credential/corpus storage) and
 * cipherEngine.js (the cipher itself) into the actual UI, following the
 * frictionless flow documented in TECH_SPECS_CIFRADO_TANGOS.md Paso 5:
 *
 *   First run:  hasPayloadDirect() -> false -> ask CLAVE_DESPLIEGUE ->
 *               fetch encrypted-bundle.json -> unlockDeployBundle() ->
 *               savePayloadDirect({ tangos, salt })
 *
 *   Every other day: loadPayloadDirect() -> straight to the composer,
 *               no password.
 *
 * DEFAULT MODE (frictionless, matches secure-vault.js's own docs): the
 * unlocked payload sits in IndexedDB as plain JSON on this device. That is
 * a conscious trade-off in favor of zero daily friction, not an oversight.
 *
 * OPT-IN PIN MODE: Settings > "Seguridad del dispositivo" lets the user
 * switch to the PIN-gated device vault (sealForDevice/openDeviceVault from
 * secure-vault.js) instead. In that mode the app asks for a PIN on every
 * open (handlePinUnlockSubmit) rather than loading straight into the
 * composer. Which mode is active is tracked in
 * localStorage[VAULT_MODE_KEY] and mirrored in the module-level `vaultMode`
 * variable below.
 *
 * Telegram bot token + chat id are separate from the tango corpus: they're
 * this user's own delivery-channel credentials, not the cipher secret.
 *   - Frictionless mode: kept in localStorage, same as before. Losing them
 *     only means re-typing a bot token, not re-deriving the cipher.
 *   - PIN mode: kept *inside* the sealed vault payload alongside the corpus
 *     (see TO_FIX.md P3-3) — on a lost/stolen device in PIN mode, an
 *     attacker who can't open the vault also can't send Telegram messages
 *     impersonating the user.
 */

import { cifrarMensaje, descifrarMensaje } from "./cipherEngine.js";
import { consumeDeepLink, buildDeepLink, buildSendMessageBody } from "./deeplink.js";
import {
    unlockDeployBundle,
    savePayloadDirect,
    loadPayloadDirect,
    hasPayloadDirect,
    deletePayloadDirect,
    sealForDevice,
    openDeviceVault,
    saveSealedVault,
    loadSealedVault,
    hasSealedVault,
    deleteSealedVault,
} from "./secure-vault.js";

const TELEGRAM_CONFIG_KEY = "tango-cifrado:telegram-config";
const VAULT_MODE_KEY = "tango-cifrado:vault-mode"; // 'direct' | 'pin'
const BUNDLE_URL = "./encrypted-bundle.json";
// Telegram's sendMessage caps text at 4096 UTF-8 characters -- checked
// upfront so a long message fails with a clear reason instead of a bare
// HTTP 400 after the user already hit "Enviar".
const TELEGRAM_MAX_LEN = 4096;

// ---------- state ----------

let payload = null; // { tangos, salt } in direct mode; { tangos, salt, telegram } in pin mode
let mode = "cifrar"; // 'cifrar' | 'descifrar'
let bundleGeneratedAt = null; // ISO string from the fetched bundle's plaintext metadata, or null
let vaultMode = "direct"; // 'direct' | 'pin' -- resolved from localStorage at boot
let sessionPin = null; // the PIN used to open the device vault this session, kept in
// memory only (never persisted) so Settings can re-seal the vault after an
// edit (e.g. saving new Telegram credentials) without prompting for the PIN
// again on every save. Cleared on "Desactivar PIN" and on page reload.

// ---------- small DOM helpers ----------

const $ = (sel) => document.querySelector(sel);

function showScreen(name) {
    $("#unlock-screen").hidden = name !== "unlock";
    $("#pin-unlock-screen").hidden = name !== "pin-unlock";
    $("#app-screen").hidden = name !== "app";
}

function setStatus(el, message, kind = "info") {
    el.textContent = message;
    el.dataset.kind = message ? kind : "";
}

function iterTangos(tangos) {
    // Mirrors iter_tangos() in cipher_engine.py: skip metadata keys like
    // '_nota' and anything that isn't a real tango record.
    return Object.entries(tangos).filter(
        ([clave, valor]) => !clave.startsWith("_") && typeof valor === "object" && valor !== null
    );
}

// ---------- Telegram config (storage location depends on vaultMode) ----------

function loadTelegramConfigFromLocalStorage() {
    try {
        const raw = localStorage.getItem(TELEGRAM_CONFIG_KEY);
        return raw ? JSON.parse(raw) : { botToken: "", chatId: "" };
    } catch {
        return { botToken: "", chatId: "" };
    }
}

function saveTelegramConfigToLocalStorage(config) {
    localStorage.setItem(TELEGRAM_CONFIG_KEY, JSON.stringify(config));
}

/**
 * Reads the current Telegram config from wherever this vaultMode keeps it:
 * localStorage in direct mode, or the (already-unlocked, in-memory) sealed
 * payload in pin mode. Always returns synchronously -- pin mode never hits
 * IndexedDB here because the vault is already open in `payload` by the time
 * any screen that needs this has been reached.
 */
function getTelegramConfig() {
    if (vaultMode === "pin") {
        return (payload && payload.telegram) || { botToken: "", chatId: "" };
    }
    return loadTelegramConfigFromLocalStorage();
}

/**
 * Persists a new Telegram config to wherever this vaultMode keeps it. In pin
 * mode this re-seals the whole vault under `sessionPin` -- there's no way to
 * update just the Telegram fields inside an AES-GCM ciphertext without
 * re-encrypting the payload it's part of.
 */
async function setTelegramConfig(config) {
    if (vaultMode === "pin") {
        if (!sessionPin || !payload) {
            throw new Error("La bóveda no está abierta -- no se puede guardar.");
        }
        payload.telegram = config;
        const sealed = await sealForDevice(sessionPin, payload);
        await saveSealedVault(sealed);
    } else {
        saveTelegramConfigToLocalStorage(config);
    }
}

async function enviarATelegram(mensajeCifrado, botToken, chatId) {
    if (mensajeCifrado.length > TELEGRAM_MAX_LEN) {
        throw new Error(
            `El mensaje cifrado mide ${mensajeCifrado.length} caracteres, ` +
            `Telegram acepta un máximo de ${TELEGRAM_MAX_LEN}. Probá con un ` +
            `mensaje más corto.`
        );
    }

    const deepLink = buildDeepLink(location.origin, location.pathname, location.search, mensajeCifrado);

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildSendMessageBody(mensajeCifrado, chatId, deepLink)),
    });
    if (!resp.ok) {
        let detalle = "";
        try {
            const body = await resp.json();
            detalle = body && body.description ? body.description : "";
        } catch {
            // Telegram error responses are normally JSON; if parsing fails,
            // fall back to the bare status below.
        }
        throw new Error(detalle ? `Telegram: ${detalle}` : `Telegram respondió con error ${resp.status}`);
    }
}

// ---------- vault mode (direct vs PIN-gated) ----------

function getVaultMode() {
    return localStorage.getItem(VAULT_MODE_KEY) === "pin" ? "pin" : "direct";
}

function setVaultMode(newMode) {
    localStorage.setItem(VAULT_MODE_KEY, newMode);
    vaultMode = newMode;
}

// ---------- first-run unlock ----------

async function handleUnlockSubmit(event) {
    event.preventDefault();
    const claveInput = $("#clave-despliegue");
    const statusEl = $("#unlock-status");
    const button = $("#unlock-submit");

    const claveDespliegue = claveInput.value.trim();
    if (!claveDespliegue) {
        setStatus(statusEl, "Ingresá la clave de despliegue.", "error");
        return;
    }

    button.disabled = true;
    setStatus(statusEl, "Descargando paquete cifrado…", "info");

    try {
        const resp = await fetch(BUNDLE_URL, { cache: "no-cache" });
        if (!resp.ok) {
            if (resp.headers.get("X-Tango-Offline") === "1") {
                throw new Error(
                    "Sin conexión y no hay una copia guardada del paquete cifrado. " +
                    "Conectate a internet y probá de nuevo."
                );
            }
            throw new Error(`No se pudo descargar ${BUNDLE_URL} (${resp.status})`);
        }
        const bundle = await resp.json();

        setStatus(statusEl, "Descifrando…", "info");
        payload = await unlockDeployBundle(claveDespliegue, bundle);

        if (bundle.generated_at) {
            bundleGeneratedAt = bundle.generated_at;
            localStorage.setItem(BUNDLE_GENERATED_AT_KEY, bundle.generated_at);
            showBundleGeneratedAt(bundle.generated_at);
        }

        setVaultMode("direct");
        await savePayloadDirect(payload);
        claveInput.value = "";

        setStatus(statusEl, "", "info");
        enterComposer();
    } catch (err) {
        setStatus(statusEl, err.message || "No se pudo desbloquear el paquete.", "error");
    } finally {
        button.disabled = false;
    }
}

// ---------- PIN unlock (device vault, opt-in) ----------

async function handlePinUnlockSubmit(event) {
    event.preventDefault();
    const pinInput = $("#device-pin");
    const statusEl = $("#pin-unlock-status");
    const button = $("#pin-unlock-submit");

    const pin = pinInput.value;
    if (!pin) {
        setStatus(statusEl, "Ingresá tu PIN.", "error");
        return;
    }

    button.disabled = true;
    setStatus(statusEl, "Verificando…", "info");

    try {
        const sealed = await loadSealedVault();
        if (!sealed) {
            // Shouldn't normally happen (init() only shows this screen when
            // hasSealedVault() was true), but IndexedDB can be cleared out
            // from under the app -- fail with a clear message instead of a
            // confusing decrypt error.
            throw new Error("No se encontró la bóveda protegida en este dispositivo.");
        }
        const opened = await openDeviceVault(pin, sealed);
        payload = opened; // { tangos, salt, telegram }
        sessionPin = pin;
        pinInput.value = "";

        setStatus(statusEl, "", "info");
        enterComposer();
    } catch (err) {
        setStatus(statusEl, err.message || "PIN incorrecto.", "error");
    } finally {
        button.disabled = false;
    }
}

// ---------- composer ----------

function populateTangoSelect() {
    const select = $("#tango-select");
    select.innerHTML = "";
    for (const [id, tango] of iterTangos(payload.tangos)) {
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = `${id} — ${tango.titulo}`;
        select.appendChild(opt);
    }
}

function renderCoordinateStrip(codigoCifrado) {
    const strip = $("#output-strip");
    strip.innerHTML = "";
    const partes = codigoCifrado.split("-");
    partes.forEach((token, i) => {
        const chip = document.createElement("span");
        chip.className = "chip" + (i === 0 ? " chip--key" : "");
        chip.textContent = token || "·";
        strip.appendChild(chip);
    });
}

function renderPlainOutput(text) {
    const strip = $("#output-strip");
    strip.innerHTML = "";
    const p = document.createElement("p");
    p.className = "plain-output";
    p.textContent = text;
    strip.appendChild(p);
}

function setMode(newMode) {
    mode = newMode;
    $("#mode-cifrar").classList.toggle("is-active", mode === "cifrar");
    $("#mode-descifrar").classList.toggle("is-active", mode === "descifrar");
    $("#tango-field").hidden = mode !== "cifrar";
    $("#message-input").placeholder =
        mode === "cifrar" ? "Escribí el mensaje…" : "Pegá el código cifrado (ej: 50-V09P01-~20-…)";
    $("#message-label").textContent = mode === "cifrar" ? "Mensaje" : "Código cifrado";
    $("#run-action").textContent = mode === "cifrar" ? "Cifrar" : "Descifrar";
    $("#message-input").value = "";
    $("#output-strip").innerHTML = "";
    $("#send-row").hidden = true;
    $("#send-row").dataset.cipherText = "";
    setStatus($("#composer-status"), "", "info");
}

async function handleRunAction() {
    const input = $("#message-input").value;
    const statusEl = $("#composer-status");
    setStatus(statusEl, "", "info");
    $("#send-row").hidden = true;

    if (!input.trim()) {
        setStatus(statusEl, mode === "cifrar" ? "Escribí un mensaje." : "Pegá un código cifrado.", "error");
        return;
    }

    try {
        if (mode === "cifrar") {
            const idTango = $("#tango-select").value;
            const codigo = await cifrarMensaje(idTango, input, payload.tangos, payload.salt);
            renderCoordinateStrip(codigo);
            $("#send-row").hidden = false;
            $("#send-row").dataset.cipherText = codigo;
        } else {
            const texto = await descifrarMensaje(input, payload.tangos, payload.salt);
            renderPlainOutput(texto);
        }
    } catch (err) {
        setStatus(statusEl, err.message || "Ocurrió un error.", "error");
    }
}

async function handleCopy() {
    const strip = $("#output-strip");
    const text = strip.dataset && $("#send-row").dataset.cipherText
        ? $("#send-row").dataset.cipherText
        : strip.textContent;
    try {
        await navigator.clipboard.writeText(text);
        setStatus($("#composer-status"), "Copiado.", "success");
    } catch {
        setStatus($("#composer-status"), "No se pudo copiar automáticamente — seleccioná el texto manualmente.", "error");
    }
}

async function handleSend() {
    const statusEl = $("#composer-status");
    const { botToken, chatId } = getTelegramConfig();

    if (!botToken || !chatId) {
        setStatus(statusEl, "Configurá tu bot de Telegram en Ajustes antes de enviar.", "error");
        $("#settings-panel").hidden = false;
        return;
    }

    const codigo = $("#send-row").dataset.cipherText;
    const button = $("#send-button");
    button.disabled = true;
    setStatus(statusEl, "Enviando a Telegram…", "info");

    try {
        await enviarATelegram(codigo, botToken, chatId);
        setStatus(statusEl, "Enviado.", "success");
    } catch (err) {
        setStatus(statusEl, err.message || "Error al enviar a Telegram.", "error");
    } finally {
        button.disabled = false;
    }
}

// ---------- settings ----------

const BUNDLE_GENERATED_AT_KEY = "tango-cifrado:bundle-generated-at";

function showBundleGeneratedAt(iso) {
    const bundleInfo = $("#bundle-info");
    if (!bundleInfo || !iso) return;
    const fecha = new Date(iso);
    const texto = Number.isNaN(fecha.getTime())
        ? iso
        : fecha.toLocaleDateString("es", { year: "numeric", month: "long", day: "numeric" });
    bundleInfo.textContent = `Corpus actualizado el ${texto}.`;
}

// Runs on every app load, unlock or frictionless alike. generated_at sits in
// the bundle's plaintext metadata, outside the AES-GCM ciphertext -- so this
// can check "is there a newer corpus on the server?" without touching
// CLAVE_DESPLIEGUE or re-deriving any key. Fails silently offline; whatever
// was last known (from localStorage) stays displayed.
async function refreshBundleGeneratedAt() {
    try {
        const resp = await fetch(BUNDLE_URL, { cache: "no-cache" });
        if (!resp.ok) return;
        const bundle = await resp.json();
        if (bundle.generated_at) {
            localStorage.setItem(BUNDLE_GENERATED_AT_KEY, bundle.generated_at);
            showBundleGeneratedAt(bundle.generated_at);
        }
    } catch {
        // Offline, or the bundle isn't reachable right now -- not fatal,
        // the last known date (if any) is already shown from localStorage.
    }
}

// Reads the Telegram fields into the form. Split out from initSettings()
// because at boot time (initSettings runs once, before any vault is open)
// there's nothing to show yet in pin mode -- payload doesn't exist until
// handlePinUnlockSubmit or handleUnlockSubmit succeeds. Called again from
// enterComposer() once a payload is actually available.
function populateTelegramFields() {
    const { botToken, chatId } = getTelegramConfig();
    $("#bot-token").value = botToken;
    $("#chat-id").value = chatId;
}

function initSettings() {
    // Show whatever was last known immediately (no network wait); the
    // background refreshBundleGeneratedAt() call from init() will update
    // this in place if a fetch succeeds and finds a newer bundle.
    showBundleGeneratedAt(localStorage.getItem(BUNDLE_GENERATED_AT_KEY));

    $("#settings-toggle").addEventListener("click", () => {
        $("#settings-panel").hidden = !$("#settings-panel").hidden;
    });

    $("#settings-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        const statusEl = $("#settings-status");
        try {
            await setTelegramConfig({
                botToken: $("#bot-token").value.trim(),
                chatId: $("#chat-id").value.trim(),
            });
            setStatus(statusEl, "Guardado.", "success");
        } catch (err) {
            setStatus(statusEl, err.message || "No se pudo guardar.", "error");
        }
    });
}

// ---------- security settings (direct <-> PIN-gated vault toggle) ----------

function updateSecurityPanel() {
    const modeStatus = $("#security-mode-status");
    const enableForm = $("#enable-pin-form");
    const disableButton = $("#disable-pin-button");

    if (vaultMode === "pin") {
        setStatus(modeStatus, "Este dispositivo está protegido con PIN.", "success");
        enableForm.hidden = true;
        disableButton.hidden = false;
    } else {
        setStatus(
            modeStatus,
            "Sin PIN: cualquiera con acceso al dispositivo puede leer el corpus y las credenciales de Telegram.",
            "info"
        );
        enableForm.hidden = false;
        disableButton.hidden = true;
    }
}

function initSecuritySettings() {
    $("#security-toggle").addEventListener("click", () => {
        $("#security-panel").hidden = !$("#security-panel").hidden;
        if (!$("#security-panel").hidden) updateSecurityPanel();
    });

    $("#enable-pin-form").addEventListener("submit", handleEnablePin);
    $("#disable-pin-button").addEventListener("click", handleDisablePin);
}

async function handleEnablePin(event) {
    event.preventDefault();
    const statusEl = $("#security-status");
    const newPinInput = $("#new-pin");
    const confirmPinInput = $("#confirm-pin");
    const newPin = newPinInput.value;
    const confirmPin = confirmPinInput.value;

    if (!newPin || newPin.length < 4) {
        setStatus(statusEl, "El PIN debe tener al menos 4 dígitos.", "error");
        return;
    }
    if (newPin !== confirmPin) {
        setStatus(statusEl, "Los PIN no coinciden.", "error");
        return;
    }
    if (!payload) {
        setStatus(statusEl, "Todavía no hay un corpus cargado.", "error");
        return;
    }

    setStatus(statusEl, "Activando PIN…", "info");
    try {
        // Fold today's Telegram config (still in localStorage, since we're
        // coming from direct mode) into the payload that gets sealed, per
        // TO_FIX.md P3-3 -- from here on it lives inside the vault instead.
        const currentTelegram = loadTelegramConfigFromLocalStorage();
        const toSeal = { tangos: payload.tangos, salt: payload.salt, telegram: currentTelegram };

        const sealed = await sealForDevice(newPin, toSeal);
        await saveSealedVault(sealed);
        await deletePayloadDirect();
        localStorage.removeItem(TELEGRAM_CONFIG_KEY);

        payload = toSeal;
        sessionPin = newPin;
        setVaultMode("pin");

        newPinInput.value = "";
        confirmPinInput.value = "";
        populateTelegramFields();
        setStatus(statusEl, "PIN activado. La próxima vez que abras la app, te lo va a pedir.", "success");
        updateSecurityPanel();
    } catch (err) {
        setStatus(statusEl, err.message || "No se pudo activar el PIN.", "error");
    }
}

async function handleDisablePin() {
    const statusEl = $("#security-status");
    if (!sessionPin) {
        // Shouldn't be reachable in practice -- this button is only visible
        // after a successful PIN unlock in this same session -- but guard
        // against it anyway rather than silently failing sealForDevice below.
        setStatus(statusEl, "No se puede desactivar el PIN sin haberlo desbloqueado en esta sesión.", "error");
        return;
    }
    if (!confirm("¿Desactivar el PIN? El corpus y las credenciales de Telegram van a quedar sin cifrar en este dispositivo.")) {
        return;
    }

    setStatus(statusEl, "Desactivando…", "info");
    try {
        const sealed = await loadSealedVault();
        const opened = await openDeviceVault(sessionPin, sealed);
        const telegram = opened.telegram || { botToken: "", chatId: "" };

        await savePayloadDirect({ tangos: opened.tangos, salt: opened.salt });
        saveTelegramConfigToLocalStorage(telegram);
        await deleteSealedVault();

        payload = { tangos: opened.tangos, salt: opened.salt };
        sessionPin = null;
        setVaultMode("direct");

        populateTelegramFields();
        setStatus(statusEl, "PIN desactivado.", "success");
        updateSecurityPanel();
    } catch (err) {
        setStatus(statusEl, err.message || "No se pudo desactivar el PIN.", "error");
    }
}

// ---------- deep link (incoming ciphertext via #c=...) ----------

// consumeDeepLink() and buildSendMessageBody() live in ./deeplink.js and are
// imported at the top of this file. See TO_FIX.md F-6 for the history of
// why they were extracted.

/**
 * If a ciphertext arrived via deep link, switch to Descifrar mode and
 * pre-load it into the textarea. Called from enterComposer() once the
 * vault is open and the composer is visible.
 *
 * Fase 7.2: if the vault was already open (frictionless mode, no unlock
 * screen was shown), auto-run descifrarMensaje() immediately so the
 * receiver sees the plaintext in one tap instead of two. If decryption
 * fails (malformed fragment), the existing error handling in
 * handleRunAction() shows a descriptive message — no crash.
 *
 * @param {boolean} autoRun - true when enterComposer() was reached without
 *   going through an unlock screen (vault was already open this session).
 */
function applyDeepLinkIfPending(autoRun = false) {
    if (!pendingDeepLink) return;
    const codigo = pendingDeepLink;
    pendingDeepLink = null;

    setMode("descifrar");
    $("#message-input").value = codigo;

    if (autoRun) {
        // Vault already open — run decryption immediately. handleRunAction()
        // handles both the success path (renders plaintext) and the error
        // path (shows descriptive status message) without any extra code here.
        handleRunAction();
    } else {
        // Vault was just unlocked — surface a hint so the user knows what
        // landed in the field and what to do next.
        setStatus($("#composer-status"), "Mensaje recibido — tocá Descifrar para leerlo.", "info");
    }
}

// Module-level variable — set by consumeDeepLink() inside init(), before
// the vault unlock path begins. Keeping it here (rather than inside init's
// closure) lets applyDeepLinkIfPending() and enterComposer() reach it
// without parameters while still being called lazily (not at parse time).
let pendingDeepLink = null;

function enterComposer(autoRunDeepLink = false) {
    populateTangoSelect();
    populateTelegramFields();
    setMode("cifrar");
    showScreen("app");
    applyDeepLinkIfPending(autoRunDeepLink);
}

async function init() {
    // Read and clear the URL fragment first — before any async work — so the
    // ciphertext disappears from the address bar even if vault unlock is slow.
    pendingDeepLink = consumeDeepLink();
    $("#unlock-form").addEventListener("submit", handleUnlockSubmit);
    $("#pin-unlock-form").addEventListener("submit", handlePinUnlockSubmit);
    $("#mode-cifrar").addEventListener("click", () => setMode("cifrar"));
    $("#mode-descifrar").addEventListener("click", () => setMode("descifrar"));
    $("#run-action").addEventListener("click", handleRunAction);
    $("#copy-button").addEventListener("click", handleCopy);
    $("#send-button").addEventListener("click", handleSend);

    // Hide the send-row and clear the output whenever the textarea is emptied.
    // Without this, clicking Cifrar then erasing the text leaves the Copiar /
    // Enviar buttons visible with stale ciphertext behind them.
    $("#message-input").addEventListener("input", () => {
        if (!$("#message-input").value.trim()) {
            $("#send-row").hidden = true;
            $("#send-row").dataset.cipherText = "";
            $("#output-strip").innerHTML = "";
            setStatus($("#composer-status"), "", "info");
        }
    });
    initSettings();
    initSecuritySettings();

    // Fire-and-forget: checks whether a newer bundle exists on the server,
    // on both the first-run and frictionless paths alike. Never awaited --
    // this must not delay showing any of the three screens below.
    refreshBundleGeneratedAt();

    vaultMode = getVaultMode();

    if (vaultMode === "pin" && (await hasSealedVault())) {
        showScreen("pin-unlock");
    } else if (await hasPayloadDirect()) {
        payload = await loadPayloadDirect();
        enterComposer(true); // vault was already open — auto-run deep link if present
    } else {
        // Covers true first run, and the edge case where localStorage says
        // 'pin' but the sealed IndexedDB record is missing (e.g. the user
        // cleared site data by hand) -- fall back to asking for
        // CLAVE_DESPLIEGUE again instead of showing a PIN prompt that can
        // never succeed.
        setVaultMode("direct");
        showScreen("unlock");
    }

    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("./service-worker.js")
            .then((registration) => {
                // Browsers only check service-worker.js for changes in the
                // background every ~24h by default. Forcing a check on every
                // load means a forgotten CACHE_VERSION bump still gets
                // noticed the next time the user opens the app, not up to a
                // day later.
                registration.update().catch(() => {});
            })
            .catch(() => {
                // Offline install just won't be available this session; the app
                // still works online without it.
            });
    }
}

init();

