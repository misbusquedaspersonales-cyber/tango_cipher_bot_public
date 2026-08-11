# Sistema de Cifrado por Tangos + Telegram

## Arquitectura

Cifrado por libro basado en un corpus privado de letras de tango (`tangos.json`). Cada palabra del mensaje se codifica como una coordenada `V[verso]P[palabra]` dentro del tango elegido. El ID del tango se enmascara sumando un SALT. Las palabras fuera del corpus se cifran con XOR SALT en hexadecimal (`#hex`). La puntuación, espacios y mayúsculas se preservan exactamente — el round-trip es lossless.

El corpus y el SALT nunca viajan en texto plano: GitHub Actions los cifra con AES-256-GCM antes de publicar la PWA. En el dispositivo quedan guardados en IndexedDB tras un único desbloqueo en el primer arranque.

**PWA en Vivo:** [tango_cipher_bot_public/pwa](https://misbusquedaspersonales-cyber.github.io/tango_cipher_bot_public/pwa/index.html)

### URLs cortas y atajos de acceso

La PWA se publica en GitHub Pages en una ruta un poco larga. Para no tener que escribirla
completa cada vez, hay varias alternativas:

#### 🔗 URLs cortas (funcionan una vez que se deployaron los redirects del root)

En la raíz del repo hay dos archivos (`index.html` y `go.html`) que redirigen
automáticamente a `/pwa/index.html`. Si esos archivos están pusheados a `main` y GitHub
Pages ya los publicó, podés usar directamente:

| URL corta | Redirige a |
|---|---|
| `https://misbusquedaspersonales-cyber.github.io/tango_cipher_bot_public/` | `/pwa/index.html` |
| `https://misbusquedaspersonales-cyber.github.io/tango_cipher_bot_public/go.html` | `/pwa/index.html` |

Si entrás a la URL raíz y GitHub Pages muestra 404, es porque los redirects del root
todavía no están pusheados (son `untracked`). Subilos así:

```bash
git add index.html go.html pwa/go.html
git commit -m "feat: root redirects for short GitHub Pages URLs"
git push origin main
```

Esperá ~1 minuto a que GitHub Pages termine el deploy y listo.

#### 📱 Bookmark / "Add to Home Screen" (sin escribir URLs nunca más)

Esta opción no requiere código ni comandos:

- **Desktop:** Abrí la PWA en tu navegador → `Ctrl+D` (`Cmd+D` en macOS) y guardala en la barra de bookmarks. Un click y ya está.
- **Android (Chrome):** Abrí la PWA → menú ⋮ → **"Instalar app"** / **"Agregar a pantalla de inicio"**. Queda un ícono nativo en el launcher.
- **iPhone (Safari):** Abrí la PWA → botón compartir (⬆️ en caja) → **"Agregar a pantalla de inicio"**. Misma experiencia que una app nativa.

#### 💻 Aliases de shell (comandos de terminal)

En `scripts/aliases/` hay tres comandos ejecutables listos para usar. Agregalos a tu `$PATH`
agregando esta línea al final de tu `~/.bashrc`, `~/.zshrc` o `~/.profile`:

```bash
export PATH="/ruta/al/repo/scripts/aliases:$PATH"
```

Reabrí tu terminal (o corré `source ~/.bashrc`) y ya podés usar:

| Comando | Qué hace |
|---|---|
| `tango` | Abre la PWA en tu navegador predeterminado (usa `xdg-open` en Linux, `open` en macOS, `start` en Windows). |
| `tango --short` o `tango -s` | Abre la URL corta (raíz del Pages) en vez de la ruta larga a `/pwa/index.html`. |
| `tango-url` | Imprime la URL completa por salida estándar y la copia automáticamente al clipboard si detecta `xclip`, `wl-copy` o `pbcopy`. Ideal para pegar en chats, mails, notas. |
| `tango-url --short` o `tango-url -s` | Lo mismo pero imprime/copia la URL corta. |
| `tango-cli` | Corré el CLI local (`python3 main.py`) desde cualquier carpeta, activando automáticamente el `venv` del proyecto si existe. |

Ejemplo de uso rápido:

```
$ tango-url
Tango Cifrado URL (full):
  https://misbusquedaspersonales-cyber.github.io/tango_cipher_bot_public/pwa/index.html
  (copiado al clipboard con xclip)

$ tango
✅ Abriendo Tango Cifrado → https://misbusquedaspersonales-cyber.github.io/tango_cipher_bot_public/pwa/index.html
```

```
[ Repo privado ]  →  [ setup_private_core.sh / CI ]  →  [ Repo público / GitHub Pages ]
  tangos.json           AES-256-GCM (build bundle)           encrypted-bundle.json
  SALT secreto          PBKDF2-HMAC-SHA256                   PWA estática
  código fuente         CLAVE_DESPLIEGUE
```

## Estructura del Proyecto

| Archivo / Carpeta | Descripción |
|---|---|
| `tangos.json` | Corpus de tangos. Versos de relleno técnico marcados con `"padding": true`. |
| `src/tango_cifrado/corpus.py` | Único adaptador sobre `private_core.cipher_engine` — el único archivo del repo público que importa del módulo vendored. Todos los demás módulos Python importan desde aquí. |
| `src/tango_cifrado/telegram.py` | Implementación del envío a Telegram (movida desde `telegram_client.py`). |
| `src/tango_cifrado/cli.py` | Lógica del CLI interactivo (movida desde `main.py`). |
| `main.py` | Shim de entrada: ajusta `sys.path` y delega a `tango_cifrado.cli`. |
| `telegram_client.py` | Shim de re-exportación: mantiene compatibilidad hacia atrás para tests y callers externos. |
| `secure-vault.js` | Gestión de credenciales en el browser (Layer 1: bundle deploy, Layer 2: PIN opcional, flujo sin fricción por defecto). |
| `scripts/ci/build_encrypted_bundle.py` | Copia de referencia del script homónimo del repo privado. Usada por `tests/python/test_build_encrypted_bundle.py`. **No corre en CI** — la versión activa en producción vive en el repo privado en `scripts/build_encrypted_bundle.py`. Mantenerlas en sincronía a mano. |
| `scripts/ci/decrypt_bundle_cli.py` | Ídem — copia de referencia local. La versión activa está en el repo privado. |
| `scripts/dev/setup_private_core.sh` | Configura el entorno local clonando el repo privado en un estado "vendored" (pinneado a un commit SHA). |
| `scripts/aliases/` | Comandos cortos de terminal: `tango` (abrir PWA), `tango-url` (copiar URL al clipboard), `tango-cli` (wrapper del CLI local). |
| `.github/workflows/build-encrypted-bundle.yml` | GitHub Actions workflow de build (solo en el repo privado). |
| `.github/workflows/drift-check.yml` | GitHub Actions workflow semanal: compara el `PRIVATE_CORE_COMMIT` pinneado contra el HEAD del repo privado y abre Issue automático si detecta drift. Requiere el secreto `PRIVATE_REPO_PAT`. |
| `tests/` | 97 tests total once `private_core/` is populated: 41 JS (`tests/js/`) + 13 Python always-runnable (`tests/python/test_build_encrypted_bundle.py` + `test_telegram_client.py`) + 43 Python requiring `private_core/` (`test_cipher_engine.py`: 33 original + 11 shared vectors). JS breakdown: `cipherEngine.test.mjs` 27 (16 fixed + 11 shared-vector loop), `pwa_e2e.test.mjs` 3, `deeplink.test.mjs` 11. Run `python3 -m pytest tests/python/ -v` and `npm test` separately. |

## Setup del CLI (desarrollo / pruebas)

Antes de trabajar con commits locales, activa la guardia de seguridad para evitar filtrar el corpus privado:

```bash
git config core.hooksPath hooks
```

```bash
python3 -m venv venv
source venv/bin/activate
pip install requests python-dotenv cryptography pytest
cp .env.example .env
# editar .env con tu TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID
# ver TROUBLESHOOTING.md si no tienes el CHAT_ID
python3 main.py
```

## Configuración del Bot de Telegram

1. Abre Telegram y busca **@BotFather**.
2. Envía `/newbot` y sigue las instrucciones.
3. Copia el TOKEN HTTP API.
4. Envíale `/start` a tu nuevo bot.
5. Obtén tu `CHAT_ID` — ver `TROUBLESHOOTING.md`.
6. Completa `.env`:
   ```
   TELEGRAM_BOT_TOKEN=<tu_token>
   TELEGRAM_CHAT_ID=<tu_chat_id>
   ```

## Uso del CLI

```
python3 main.py
```

El script solicita la clave del tango (número del 1 al 7) y el mensaje. Cifra, envía a Telegram y muestra el descifrado local como verificación.

## Correr los tests

```bash
python3 -m pytest tests/python/ -v
```

### Verificar integridad de assets de la PWA

`scripts/dev/check_pwa_assets.py` valida en dos direcciones cualquier cambio en `pwa/`:

1. **FORWARD** — toda referencia en `manifest.json` (íconos), `index.html` (`@font-face`, `<link>`, `<img src>`) y `service-worker.js` (`SHELL_FILES`) apunta a un archivo que realmente existe en disco.
2. **REVERSE** — todo `.ttf`/`.png` dentro de `pwa/fonts/` y `pwa/icons/` está referenciado por al menos uno de esos tres archivos (evita publicar fonts/icons muertos que nadie usa pero se siguen subiendo a GitHub Pages).

Correrlo antes de cualquier PR que toque `pwa/`:

```bash
python3 scripts/dev/check_pwa_assets.py
```

### Probar la PWA instalada en un celular real

Ver `MOBILE_TESTING.md` (USB port-forwarding con `chrome://inspect`, camino de producción por HTTPS, y checklist: standalone, íconos sin fallback, offline, desbloqueo del bundle).

## Seguridad — notas importantes

- `DEFAULT_SALT = 47` en `cipher_engine.py` es un placeholder de desarrollo. En producción el SALT se inyecta como secreto de GitHub Actions (`CIFRADO_SALT`) y nunca aparece en el código público.
- La seguridad del sistema depende de mantener `tangos.json` y el SALT fuera del repo público. El pipeline de CI se encarga de esto.
- Ver `ROADMAP.md` para el estado de cada fase del proyecto.

## Secretos de GitHub Actions (CI/CD)

Para que los pipelines funcionen correctamente, el repositorio público debe tener configurados los siguientes secretos
(**Settings → Secrets and variables → Actions → New repository secret**):

| Secreto | ¿Obligatorio? | Descripción |
|---|---|---|
| `CIFRADO_SALT` | Obligatorio — **repo privado** (`build-encrypted-bundle.yml`) | Valor numérico secreto usado para enmascarar los IDs de tango. **No** es el KDF salt de PBKDF2, es el offset numérico que se suma al ID del tango antes de escribirlo en el ciphertext. |
| `CLAVE_DESPLIEGUE` | Obligatorio — **repo privado** (`build-encrypted-bundle.yml`) | Contraseña maestra de alta entropía para AES-256-GCM que desencripta el corpus y el SALT en la PWA. Usá `openssl rand -base64 32`, no una frase memorizable. |
| `PUBLIC_REPO_DEPLOY_TOKEN` | Obligatorio — **repo privado** (`build-encrypted-bundle.yml`, job `deploy-to-public-repo`) | Personal Access Token con permiso **Contents: write** sobre el repo público (`tango_cipher_bot_public`). El job lo usa para hacer push del bundle cifrado hacia el repo público después de cada build. En `.env` local este token se guarda bajo la clave `tango-bundle-public-deployer`. |
| `PRIVATE_REPO_PAT` | Obligatorio — **repo público** (`drift-check.yml`) | Personal Access Token con permisos de **lectura** sobre el repo privado (`tango_corpus_private`). Sin este secreto el workflow semanal no puede consultar el SHA remoto y falla. Se configura en el **repo público** (donde corre `drift-check.yml`), no en el privado. |

> ⚠️ Importante: no embebas tokens en la URL remota de git (`https://<token>@github.com/...`). Esto puede exponer tu PAT en la configuración local. Usa una URL limpia y un helper de credenciales en su lugar. Ver `TROUBLESHOOTING.md` para más detalles sobre este problema.
