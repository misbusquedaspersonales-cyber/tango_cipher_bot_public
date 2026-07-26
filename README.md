# Sistema de Cifrado por Tangos + Telegram

## Arquitectura

Cifrado por libro basado en un corpus privado de letras de tango (`tangos.json`). Cada palabra del mensaje se codifica como una coordenada `V[verso]P[palabra]` dentro del tango elegido. El ID del tango se enmascara sumando un SALT. Las palabras fuera del corpus se cifran con XOR SALT en hexadecimal (`#hex`). La puntuación, espacios y mayúsculas se preservan exactamente — el round-trip es lossless.

El corpus y el SALT nunca viajan en texto plano: GitHub Actions los cifra con AES-256-GCM antes de publicar la PWA. En el dispositivo quedan guardados en IndexedDB tras un único desbloqueo en el primer arranque.

**PWA en Vivo:** [tango_cipher_bot_public/pwa](https://misbusquedaspersonales-cyber.github.io/tango_cipher_bot_public/pwa/index.html)

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
| `cipher_engine.py` | Motor de cifrado Python: coordenadas, XOR hex, round-trip lossless, SALT por entorno. |
| `cipherEngine.js` | Motor equivalente en JS para la PWA. |
| `telegram_client.py` | Envío a Telegram con manejo de errores de red. |
| `main.py` | CLI de pruebas: cifra un mensaje y lo envía a Telegram. |
| `secure-vault.js` | Gestión de credenciales en el browser (Layer 1: bundle deploy, Layer 2: PIN opcional, flujo sin fricción por defecto). |
| `scripts/build_encrypted_bundle.py` | Genera el bundle cifrado para deploy. Corre en CI, nunca en el browser. |
| `scripts/decrypt_bundle_cli.py` | Smoke-test CLI para verificar el bundle antes de publicarlo. |
| `scripts/setup_private_core.sh` | Configura el entorno local clonando el repo privado en un estado "vendored" (pinneado a un commit SHA). |
| `.github/workflows/build-encrypted-bundle.yml` | GitHub Actions workflow de build. |
| `tests/` | 37 tests: cifrado, round-trip, pipeline de bundle, errores de red. |

## Setup del CLI (desarrollo / pruebas)

```bash
python3 -m venv venv
source venv/bin/activate
pip install requests python-dotenv cryptography
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
python3 -m pytest tests/ -v
```

## Seguridad — notas importantes

- `DEFAULT_SALT = 47` en `cipher_engine.py` es un placeholder de desarrollo. En producción el SALT se inyecta como secreto de GitHub Actions (`CIFRADO_SALT`) y nunca aparece en el código público.
- La seguridad del sistema depende de mantener `tangos.json` y el SALT fuera del repo público. El pipeline de CI se encarga de esto.
- Ver `ROADMAP.md` para el estado de cada fase del proyecto.
