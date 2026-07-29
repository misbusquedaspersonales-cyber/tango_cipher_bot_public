# TROUBLESHOOTING

> Nota: si querés revisar los problemas pendientes y los items de mejora no bloqueantes, consultá [TO_FIX.md](TO_FIX.md). Allí se mantiene el seguimiento de los issues de prioridad media/baja que no afectan el uso normal de la app.

## Problema 1: No tengo el CHAT_ID de Telegram

### Paso 1: Inicia una conversación con tu bot
Abre Telegram, busca tu bot y envíale cualquier mensaje (`/start` o `hola`).

> El bot no responderá — es un canal unidireccional. Enviar ese primer mensaje solo sirve para que Telegram registre tu cuenta y genere un `update` que podamos consultar.

### Paso 2: Consulta los updates del bot

```bash
curl "https://api.telegram.org/bot<TU_BOT_TOKEN>/getUpdates"
```

### Paso 3: Localiza tu CHAT_ID

```json
{
  "result": [
    {
      "message": {
        "chat": {
          "id": 1341610334,
          "first_name": "Tu Nombre"
        },
        "text": "hola"
      }
    }
  ]
}
```

El valor de `"id"` dentro de `"chat"` es tu `CHAT_ID`.

### Paso 4: Agrega los valores a `.env`

```
TELEGRAM_BOT_TOKEN=<tu_token>
TELEGRAM_CHAT_ID=<tu_chat_id>
```

---

## Problema 2: `getUpdates` devuelve lista vacía (`"result": []`)

El bot no ha recibido mensajes aún, o los mensajes expiraron (Telegram los descarta después de 24 h sin leer).

1. Abre el chat con el bot en Telegram y envía `/start`.
2. Ejecuta el `curl` del Paso 2 inmediatamente después.

---

## Problema 3: `getUpdates` devuelve "Unauthorized" (Error 401)

El token es incorrecto o fue revocado. Ve a `@BotFather`, usa `/mybots` → selecciona tu bot → `API Token` → `Revoke current token` y genera uno nuevo.

---

## Problema 4: El script crashea con "ID de tango no encontrado"

El número que ingresaste en el prompt no existe en tu `tangos.json`. Los IDs válidos dependen de cuántos tangos hayas agregado a tu corpus privado. El script muestra un mensaje de error claro y termina de forma limpia.

---

## Problema 5: Error al enviar a Telegram (timeout o sin conexión)

`telegram_client.py` captura `Timeout`, `ConnectionError` y errores HTTP sin crashear. Si ves "Error al enviar mensaje a Telegram", verifica:

1. Conexión a internet activa.
2. `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID` correctos en `.env`.
3. El bot no fue bloqueado o eliminado en Telegram.

---

## Problema 6: La PWA pide `CLAVE_DESPLIEGUE` cada vez que abro la app

No debería ocurrir con el flujo por defecto. La `CLAVE_DESPLIEGUE` se solicita **una sola vez** en el primer arranque para descifrar el bundle. El payload queda guardado en IndexedDB del dispositivo (`savePayloadDirect`). Los arranques posteriores lo cargan directamente sin pedir nada.

Si la PWA vuelve a pedir la clave, significa que IndexedDB fue borrado (limpieza de datos del browser, modo incógnito, o reinstalación). Ingresa la `CLAVE_DESPLIEGUE` nuevamente para reactivar.

---

## Problema 7: `cryptography` no está instalado (error al correr tests del bundle)

```bash
pip install cryptography
```

Si el entorno lo bloquea:

```bash
pip install cryptography --break-system-packages
```

O instalar dentro del virtualenv:

```bash
python3 -m venv venv && source venv/bin/activate && pip install requests python-dotenv cryptography
```

---

## Problema 8: La URL de GitHub Pages muestra 404 (Not Found) o está desactualizada

El despliegue en GitHub Pages puede tardar un par de minutos después de realizar el push.
1. Abre tu repositorio público en GitHub.
2. Ve a la pestaña **Settings** -> **Pages**.
3. Verifica que diga "Your site is live at...".
4. Asegúrate de navegar a `/pwa/index.html` si los archivos de la app se encuentran en la carpeta `pwa/` (ejemplo: `https://misbusquedaspersonales-cyber.github.io/tango_cipher_bot_public/pwa/index.html`).
5. Si ves una versión vieja, fuerza la actualización en tu móvil (limpiar caché o arrastrar hacia abajo para refrescar en Safari/Chrome).

---

## Problema 9: El repo privado y el repo público no están sincronizados (Drift)

Este proyecto usa un modelo de dos repos para separar lo sensible de lo público:
- El repo privado contiene el core sensible (`tangos.json`, el SALT y la lógica privada de compilación).
- El repo público contiene la PWA y el bundle cifrado que se despliega en GitHub Pages.

Si el repositorio privado avanza con nuevos tangos o correcciones y este repositorio público no se actualiza (lo que se conoce como *drift*), el modelo prevé una verificación automática mediante un workflow `drift-check.yml` que correría semanalmente y abriría un **GitHub Issue** si detecta que `PRIVATE_CORE_COMMIT` ha quedado viejo.

> ⚠️ **Nota importante:** en este momento el workflow `drift-check.yml` **no existe físicamente en el repo** (está documentado como resuelto en TO_FIX.md P3-4 y el Problema 11 de esta guía explica la discrepancia). Hasta que se cree, no habrá alertas automáticas y la comprobación debe hacerse **manualmente** siguiendo los pasos del Problema 11.

Cuando detectes drift (por alerta automática o por comprobación manual), deberás buscar el nuevo SHA en el repositorio privado, actualizar la variable `PRIVATE_CORE_COMMIT` en `scripts/setup_private_core.sh`, y correr el script localmente para sincronizar tu entorno (detalle paso a paso en Problema 11).

---

## Problema 10: El workflow `drift-check.yml` falla por error de autenticación

> ⚠️ **Nota:** este problema aplica *una vez que hayas creado* el workflow `drift-check.yml`. Actualmente el archivo **no existe** en el repo — ver el Problema 11 para detalles y para crear el workflow si querés.

El workflow de GitHub Actions diseñado para detectar si el repositorio privado avanzó (drift-check) requiere acceso de lectura al repositorio privado, el cual no está permitido de forma predeterminada.

**Síntoma:** El Action en la pestaña *Actions* falla con un error como `No se pudo obtener el SHA del repositorio privado. Verifica PRIVATE_REPO_PAT.` o un mensaje de error de autenticación de `git ls-remote`.

**Solución:**
1. Ve a tu cuenta de GitHub -> **Settings** -> **Developer settings** -> **Personal access tokens** (Tokens classic o Fine-grained).
2. Genera un nuevo token con permisos de lectura para el repositorio privado (scope `repo`).
3. Copia el token generado.
4. Ve a la pestaña **Settings** de **este repositorio público**, entra a **Secrets and variables** -> **Actions** -> **New repository secret**.
5. Crea un secreto llamado `PRIVATE_REPO_PAT` y pega allí tu token.

---

## Problema 11: El workflow `drift-check.yml` no existe en el repo (Discrepancia documentación vs. realidad)

### ¿Qué está pasando?

`TO_FIX.md` en la tabla de resumen marca **P3-4 como ✅ Resuelto** y menciona que se agregó un job programado en `.github/workflows/`. Además, los Problemas 9 y 10 de esta misma guía asumen que `drift-check.yml` existe y corre semanalmente.

**Pero el archivo no está.** En `.github/workflows/` solo existe `build-encrypted-bundle.yml`.

Esto significa que **la comprobación automática de drift NO se está ejecutando**. Nadie recibirá un Issue de GitHub alertando que `PRIVATE_CORE_COMMIT` en `scripts/setup_private_core.sh:27` (actualmente `c14366ba53f679ecf1e747e62ca49f46ad5d2e04`) se desactualizó respecto al HEAD del repo privado.

**Riesgo práctico:** si el repo privado agrega tangos nuevos, corrige padding verses, o parchea `cipher_engine.py`, este repo público seguirá apuntando a un SHA viejo sin que nadie lo note. Quienes corran `./scripts/setup_private_core.sh` obtendrán código y corpus desactualizados.

### Cómo verificar el drift MANUALMENTE (hasta que se implemente el workflow)

Ejecutá esto en tu terminal (requiere `git` y acceso de lectura al repo privado):

```bash
# 1. Obtener el SHA del HEAD actual del repo privado
git ls-remote https://github.com/misbusquedaspersonales-cyber/tango_corpus_private.git HEAD

# 2. Comparar contra el SHA pinneado en el script
grep PRIVATE_CORE_COMMIT scripts/setup_private_core.sh
```

Si los dos SHA son **distintos**, hay drift. Actualizá así:

```bash
# 1. Editar scripts/setup_private_core.sh y cambiar PRIVATE_CORE_COMMIT por el SHA nuevo
# 2. Re-clonar private_core/ localmente:
rm -rf private_core
./scripts/setup_private_core.sh

# 3. Correr los tests para confirmar que nada se rompió con la nueva versión
python3 -m pytest tests/ -v
npm test
```

### (Opcional) Crear `drift-check.yml` para recuperar la comprobación automática

Si querés que la alerta automática exista como dice TO_FIX.md, creá `.github/workflows/drift-check.yml` con el siguiente contenido. Va a necesitar el secreto `PRIVATE_REPO_PAT` (creado igual que en el Problema 10) para leer el SHA remoto sin clonar todo el repo:

```yaml
name: Drift check — private repo vs. vendored SHA

on:
  schedule:
    # Todos los lunes a las 08:00 UTC (05:00 ARG)
    - cron: '0 8 * * 1'
  workflow_dispatch: {}

jobs:
  drift-check:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2

      - name: Obtener SHA remoto del repo privado
        id: remote-sha
        env:
          PAT: ${{ secrets.PRIVATE_REPO_PAT }}
        run: |
          if [ -z "$PAT" ]; then
            echo "❌ PRIVATE_REPO_PAT no está configurado. No se puede consultar el repo privado."
            exit 1
          fi
          REMOTE_SHA=$(git ls-remote https://x-access-token:${PAT}@github.com/misbusquedaspersonales-cyber/tango_corpus_private.git HEAD | awk '{print $1}')
          echo "sha=$REMOTE_SHA" >> "$GITHUB_OUTPUT"
          echo "SHA remoto: $REMOTE_SHA"

      - name: Obtener SHA local pinneado en setup_private_core.sh
        id: local-sha
        run: |
          LOCAL_SHA=$(grep -oP 'PRIVATE_CORE_COMMIT="\K[a-f0-9]+' scripts/setup_private_core.sh)
          echo "sha=$LOCAL_SHA" >> "$GITHUB_OUTPUT"
          echo "SHA local pinneado: $LOCAL_SHA"

      - name: Comparar y abrir Issue si hay drift
        if: steps.remote-sha.outputs.sha != steps.local-sha.outputs.sha
        uses: actions/github-script@60a0d83039c74a4aee543508d2ffcb1c3799cdea # v7.0.1
        with:
          script: |
            const remote = "${{ steps.remote-sha.outputs.sha }}";
            const local = "${{ steps.local-sha.outputs.sha }}";
            await github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: "🔄 Drift detectado: private_core SHA desactualizado",
              body: `El repositorio privado avanzó respecto al SHA pinneado en \`scripts/setup_private_core.sh\`.\n\n- SHA remoto (HEAD del privado): \`${remote}\`\n- SHA local (pinneado): \`${local}\`\n\n**Acción requerida:** actualizá \`PRIVATE_CORE_COMMIT\` en \`scripts/setup_private_core.sh\`, re-corré \`./scripts/setup_private_core.sh\` y validá los tests.`,
              labels: ["drift", "maintenance"]
            });

      - name: Sin drift — reportar OK
        if: steps.remote-sha.outputs.sha == steps.local-sha.outputs.sha
        run: echo "✅ Sin drift — ambos SHA coinciden."
```

Con ese workflow activo, cada lunes a la mañana GitHub correrá la comprobación sola y, si el privado avanzó, abrirá un Issue automáticamente en este repo público (igual que lo describen TO_FIX.md P3-4 y el Problema 9 arriba).
