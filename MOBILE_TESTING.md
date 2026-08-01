# MOBILE_TESTING.md — Probar la PWA como app móvil de verdad

Esta guía cubre cómo llevar la PWA de "archivos en una carpeta" a "app instalada en tu celular". La **primera sección** explica la conexión / setup USB; la **segunda sección** (checklist) es específica para cada release y debe re-recorerse *antes de marcar un deploy como OK*.

---

## Camino rápido (Android + Chrome, local dev)

1. En la carpeta del proyecto, levantar un servidor local:
   ```bash
   python3 -m http.server 8000
   ```
2. Conectar el celular por USB y habilitar Depuración USB (en Opciones de desarrollador).
3. En Chrome de escritorio, abrir `chrome://inspect#devices`.
4. Añadir port forwarding: `8000` -> `localhost:8000`.
5. Abrir `http://localhost:8000/pwa/index.html` desde el navegador del celular.
6. Instalar la app desde el navegador y probarla como aplicación instalada.

## Camino de producción (iPhone / Android real, HTTPS)

Para una experiencia real de instalación, la app debe servirse sobre HTTPS real — por ejemplo GitHub Pages:
```
URL corta (raíz):    https://misbusquedaspersonales-cyber.github.io/tango_cipher_bot_public/
URL corta (go.html): https://misbusquedaspersonales-cyber.github.io/tango_cipher_bot_public/go.html
URL larga (manual):  https://misbusquedaspersonales-cyber.github.io/tango_cipher_bot_public/pwa/index.html
```
En iPhone Safari: Compartir → Agregar a pantalla de inicio. En Android Chrome: ⋮ → Instalar app.

---

## ✅ Checklist de regresión — Release 2026-07-31 (caché + short URLs)

Este checklist **no es genérico**: los 7 puntos ejercitan específicamente los cambios del parche caché del 2026-07-31 (service worker rewrite, CACHE_VERSION v5→v7, fallback offline distinguible X-Tango-Offline, redirects de raíz). Si algo falla acá, el deploy no pasa.

### 0. Pre-requisito: los redirects de raíz están pusheados

Los archivos de entrada corta **no deben estar untracked** en el repo público (si lo están, las URLs cortas dan 404 en GH Pages). Verificá antes de deployar:

```bash
git status index.html go.html pwa/go.html pwa/.nojekyll .nojekyll
# Todos deben figurar como tracked (no "Untracked files").
# Si faltan:
git add index.html go.html pwa/go.html pwa/.nojekyll .nojekyll
git commit -m "feat: root redirects for short GitHub Pages URLs"
git push origin main
```

### 1. Short URL → redirect instantáneo (raíz + go.html)

En Chrome mobile **limpio** (cerrar tabs previos, sin caché del sitio):
- Ir a la URL corta de raíz: `https://misbusquedaspersonales-cyber.github.io/tango_cipher_bot_public/`
- Esperar ≤ 1s → debe redirigir automáticamente a `/pwa/index.html`
- Repetir con `/go.html` → mismo comportamiento
- **Si da 404**: el paso 0 falló (archivos no pusheados) o GH Pages aún no construyó. Esperar 30s y hard-refresh.

### 2. Instalación standalone

Desde `/pwa/index.html` en Chrome mobile:
- ⋮ (menú esquina superior derecha) → **Instalar app** → confirmar
- Cerrar Chrome, abrir la app desde el ícono nuevo en Home Screen
- Verificar: **sin barra de direcciones / sin browser chrome** (solo barra de estado Android). Si aparece la barra de URL: `manifest.json` tiene `display: standalone` correcto? SW scope OK? `index.html` meta tag `apple-mobile-web-app-capable` faltante?

### 3. First-run unlock + round-trip real de tangos

Aplicación recién instalada (sin corpus cacheado, sin localStorage de runs previos):
- Ingresar `CLAVE_DESPLIEGUE` exacta
- Esperar mensaje `"Descargando paquete cifrado…"` → `"Descifrando…"` → entra al compositor sin error
- Probar **cifrar** un texto que ejercite acentos, ñ, puntuación, dígitos, por ejemplo:
  > *"¡Mañana por la tarde iré al boliche de la calle 50 con Juan y María!"*
- Seleccionar un tango real, apretar Cifrar → debe generar coordenadas con chips (incluyendo fallback `#hex` para "boliche" si no está en corpus)
- Copiar el texto cifrado, togglear a Descifrar, pegar → debe reconstruir el **mismo texto exacto** (con ñ, !, ¡, 50, mayúsculas M/J/M). Si alguna letra acentuada se corrompe: Unicode NFKC desalineado (P1-5 falló en esta plataforma).

### 4. Fallback offline / timeout — la parte que realmente cambió

Este es el core del parche caché. Son DOS escenarios distintos (ambos deben pasar):

#### Escenario A: Bundle YA cacheado (uso cotidiano offline)

- App abierta y desbloqueada una vez (ya cargó el bundle con éxito)
- Poner teléfono en **Modo Avión** (wifi + datos off, sin cobertura)
- **Force-close total** de la app (Overview → swipe up / X) — NO solo cambiar de app
- Reabrir desde el ícono Home
- Resultado esperado: **entra directo al compositor sin delay ni error** (carga el bundle desde BUNDLE_CACHE del service worker). No debe pedir CLAVE_DESPLIEGUE de vuelta. Si cuelga cargando: el timeout del SW o el fallback `caches.match()` no están funcionales.

#### Escenario B: Bundle NUNCA cacheado (fresh install + offline)

- Borrar datos / desinstalar completamente la app (para quitar `BUNDLE_CACHE` + IndexedDB + localStorage)
- Seguir en Modo Avión (sin red de ningún tipo)
- Abrir la app, ingresar CLAVE_DESPLIEGUE, submit
- Resultado esperado: después de ~5s (NETWORK_TIMEOUT_MS), aparece el mensaje nuevo en español, NO el `HTTP 0` críptico:
  > *"Sin conexión y no hay una copia guardada del paquete cifrado. Conectate a internet y probá de nuevo."*
- **Si en cambio aparece "No se pudo descargar ./encrypted-bundle.json (0)"** — el header `X-Tango-Offline: 1` no está llegando al catch de `app.js` (revisar que el SW devuelve Response sintético y no el `Response.error()` opaco viejo).
- **Si se cuelga más de 15s esperando** — `NETWORK_TIMEOUT_MS=5000` del race del SW no está disparando el reject.

#### Volver online

- Apagar Modo Avión, esperar 5s que levante señal
- Force-close, reabrir, submit CLAVE_DESPLIEGUE → debe descargar y desbloquear normalmente.
- En Settings debe aparecer la fecha de `Corpus actualizado el DD/MM/AAAA` (confirma `refreshBundleGeneratedAt()` también anduvo con su `cache: "no-cache"`).

### 5. Service Worker update + purga de cachés viejas

Esto valida que el `CACHE_VERSION` bump v5→v7 realmente dispara la purga de viejas instalaciones. Necesitás **una instalación previa de versión vieja** (sin el parche caché). Si no la tenés: simularla usando la URL `/pwa/service-worker.js?v=viejo` en desktop antes de este test, o editar `CACHE_VERSION` a v6 en local y hacer un deploy temporal a una subruta.

Procedimiento real sobre instalación vieja ya existente en el teléfono:
1. Conectar USB, abrir `chrome://inspect#devices` en Chrome desktop, seleccionar el WebView de la PWA.
2. Abrir la app, esperar ~5s (Chrome checkea updates de SW en cada navigation).
3. **Force-close completo**. Reabrir 1 vez. (Esto es: primera apertura → update check encuentra nuevo SW, `install` + `skipWaiting`; cierre → segunda apertura → `activate` corre y purga.)
4. En DevTools desktop, pestaña Application → Service Workers:
   - ✅ El SW `tango-cifrado-v7` figura **activated & running** (no "waiting")
   - ✅ Storage → Caches: solo deberían aparecer `tango-cifrado-v7-shell`, `tango-cifrado-v7-bundle`, `tango-cifrado-v7-runtime`
   - ❌ Si aún aparece `tango-cifrado-v5-*` o `v6-*` → `clients.claim()` o `skipWaiting()` no se ejecutó. Revisar Consola por mensajes `[SW activate] purged N old caches.` (lo agrega el install/activate handlers).

### 6. Envío Telegram real desde datos móviles

Importante: usar **mobile data**, NO wifi (testea que el bot de Telegram es alcanzable desde IPs reales).
- Settings → Ajustes: pegar `botToken` y `chatId` reales. Guardar → debe decir "Guardado." éxito.
- Volver al compositor, cifrar un mensaje real corto (ej: *"Hola, prueba desde datos móviles"*).
- Apretar **Enviar a Telegram** → status debe decir "Enviando a Telegram…" → "Enviado."
- Abrir el chat del bot en Telegram mobile: debe figurar el mensaje cifrado.
- Si falla con 400 y el texto mide >4096 chars: el chequeo upfront `TELEGRAM_MAX_LEN` en `app.js:143` está OK; eso es esperado para mensajes largos. Si falla sin mensaje descriptivo y el texto es corto: `resp.json()` de Telegram API no está parseando el `description` (revisar `enviarATelegram` catch del status).

### 7. Si algo falla: cómo diagnosticar rápido

Usar **`chrome://inspect#devices`** (desktop) con el teléfono por USB → DevTools en vivo contra el WebView de la PWA. **Consola** va a tener logs exactos por cada handler del SW rewrite:

| Log prefix | Qué mirar si falla |
|---|---|
| `[SW install] precache N/12 shell files OK.` | Si `ok < 12`: algún SHELL_FILES devolvió no-OK en precache inicial. Mirar Network tab por cuál dio 404/503. |
| `[SW install] algunos shell fallaron:` | El array de URLs que fallaron. |
| `[SW activate] purged N old caches.` | Si `N = 0` en una actualización desde v5/v6: el `CACHE_VERSION` no cambió o no corre activate. |
| `[SW fetch] bundle network failed, fallback to cache.` + `err.message` | Si esto aparece y luego `X-Tango-Offline` no: `caches.match()` sí encontró una copia, pero si no se cargó la app, revisar IndexedDB del payload (secure-vault.js). |

**Network tab**, filtro por `encrypted-bundle.json`: en el Response Headers debería aparecer `X-Tango-Offline: 1` si el scenario 4B está andando; sin ese header exacto, el mensaje español de error en app.js no se dispara.

---

## Verificaciones base (cualquier release, además del checklist específico)

Además del checklist por release, confirmar siempre:
- Standalone sin barra URL ✅
- Fuentes cargan (IBM Plex Mono en chips — no fallback serif sans) ✅
- Ícono PWA en home screen (el ícono marrón/brass, no el default Chrome) ✅
