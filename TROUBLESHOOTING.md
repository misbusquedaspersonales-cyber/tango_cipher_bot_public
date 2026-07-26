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

El número que ingresaste en el prompt no existe en `tangos.json`. Los IDs válidos actualmente son `1` al `7`. El script muestra un mensaje de error claro y termina sin traceback.

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
