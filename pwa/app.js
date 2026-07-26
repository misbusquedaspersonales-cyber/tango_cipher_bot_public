/**
 * app.js
 *
 * Wires together secure-vault.js (credential/corpus storage) and
 * cipherEngine.js (the cipher itself) into the actual UI, following the
 * frictionless flow documented in PASOS_PROYECTO_CIFRADO_TANGOS.md Paso 5:
 *
 *   First run:  hasPayloadDirect() -> false -> ask CLAVE_DESPLIEGUE ->
 *               fetch encrypted-bundle.json -> unlockDeployBundle() ->
 *               savePayloadDirect({ tangos, salt })
 *
 *   Every other day: loadPayloadDirect() -> straight to the composer,
 *               no password.
 *
 * DESIGN CHOICE (frictionless, matches secure-vault.js's own docs): the
 * unlocked payload sits in IndexedDB as plain JSON on this device. That is
 * a conscious trade-off in favor of zero daily friction, not an oversight —
 * see the comments at the top of secure-vault.js if you want the PIN-gated
 * alternative (sealForDevice/openDeviceVault) instead.
 *
 * Telegram bot token + chat id are separate from the tango corpus: they're
 * this user's own delivery-channel credentials, not the cipher secret, so
 * they're kept in localStorage rather than the encrypted vault. Losing them
 * only means re-typing a bot token, not re-deriving the cipher.
 */

import { cifrarMensaje, descifrarMensaje } from "./cipherEngine.js";
import { unlockDeployBundle, savePayloadDirect, loadPayloadDirect, hasPayloadDirect } from "./secure-vault.js";

const TELEGRAM_CONFIG_KEY = "tango-cifrado:telegram-config";
const BUNDLE_URL = "./encrypted-bundle.json";
// Telegram's sendMessage caps text at 4096 UTF-8 characters -- checked
// upfront so a long message fails with a clear reason instead of a bare
// HTTP 400 after the user already hit "Enviar".
const TELEGRAM_MAX_LEN = 4096;

// ---------- state ----------

let payload = null; // { tangos, salt }
let mode = "cifrar"; // 'cifrar' | 'descifrar'
let bundleGeneratedAt = null; // ISO string from the fetched bundle's plaintext metadata, or null

// ---------- small DOM helpers ----------

const $ = (sel) => document.querySelector(sel);

function showScreen(name) {
    $("#unlock-screen").hidden = name !== "unlock";
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

// ---------- Telegram config (separate from the cipher vault) ----------

function loadTelegramConfig() {
    try {
        const raw = localStorage.getItem(TELEGRAM_CONFIG_KEY);
        return raw ? JSON.parse(raw) : { botToken: "", chatId: "" };
    } catch {
        return { botToken: "", chatId: "" };
    }
}

function saveTelegramConfig(config) {
    localStorage.setItem(TELEGRAM_CONFIG_KEY, JSON.stringify(config));
}

async function enviarATelegram(mensajeCifrado, botToken, chatId) {
    if (mensajeCifrado.length > TELEGRAM_MAX_LEN) {
        throw new Error(
            `El mensaje cifrado mide ${mensajeCifrado.length} caracteres, ` +
            `Telegram acepta un máximo de ${TELEGRAM_MAX_LEN}. Probá con un ` +
            `mensaje más corto.`
        );
    }
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: mensajeCifrado }),
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
        const resp = await fetch(BUNDLE_URL);
        if (!resp.ok) {
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
    $("#output-strip").innerHTML = "";
    $("#send-row").hidden = true;
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
    const { botToken, chatId } = loadTelegramConfig();

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
        const resp = await fetch(BUNDLE_URL);
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

function initSettings() {
    const { botToken, chatId } = loadTelegramConfig();
    $("#bot-token").value = botToken;
    $("#chat-id").value = chatId;

    // Show whatever was last known immediately (no network wait); the
    // background refreshBundleGeneratedAt() call from init() will update
    // this in place if a fetch succeeds and finds a newer bundle.
    showBundleGeneratedAt(localStorage.getItem(BUNDLE_GENERATED_AT_KEY));

    $("#settings-toggle").addEventListener("click", () => {
        $("#settings-panel").hidden = !$("#settings-panel").hidden;
    });

    $("#settings-form").addEventListener("submit", (event) => {
        event.preventDefault();
        saveTelegramConfig({
            botToken: $("#bot-token").value.trim(),
            chatId: $("#chat-id").value.trim(),
        });
        setStatus($("#settings-status"), "Guardado.", "success");
    });
}

// ---------- boot ----------

function enterComposer() {
    populateTangoSelect();
    setMode("cifrar");
    showScreen("app");
}

async function init() {
    $("#unlock-form").addEventListener("submit", handleUnlockSubmit);
    $("#mode-cifrar").addEventListener("click", () => setMode("cifrar"));
    $("#mode-descifrar").addEventListener("click", () => setMode("descifrar"));
    $("#run-action").addEventListener("click", handleRunAction);
    $("#copy-button").addEventListener("click", handleCopy);
    $("#send-button").addEventListener("click", handleSend);
    initSettings();

    // Fire-and-forget: checks whether a newer bundle exists on the server,
    // on both the first-run and frictionless paths alike. Never awaited --
    // this must not delay showing the unlock screen or composer.
    refreshBundleGeneratedAt();

    if (await hasPayloadDirect()) {
        payload = await loadPayloadDirect();
        enterComposer();
    } else {
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

