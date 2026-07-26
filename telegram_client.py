import requests

# Telegram's sendMessage caps text at 4096 UTF-8 characters. Sending anything
# longer gets rejected with HTTP 400, with no indication in the old code of
# *why* -- checking this upfront turns a confusing failed-silently send into
# a clear, actionable error before any network call happens.
TELEGRAM_MAX_LEN = 4096


def enviar_mensaje(bot_token, chat_id, texto):
    """Envía un mensaje de texto al chat indicado via Telegram Bot API.

    Returns True si el envío fue exitoso, False si hubo error HTTP o de red.
    Raises ValueError si faltan credenciales o el texto excede el límite de Telegram.
    """
    if not bot_token or not chat_id:
        raise ValueError("bot_token y chat_id son obligatorios")

    if len(texto) > TELEGRAM_MAX_LEN:
        raise ValueError(
            f"El mensaje cifrado mide {len(texto)} caracteres, "
            f"Telegram acepta un máximo de {TELEGRAM_MAX_LEN}. "
            "Probá con un mensaje más corto o un tango con más palabras "
            "en el corpus (menos texto cae en el fallback, que es lo que "
            "más infla la longitud del cifrado)."
        )

    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {"chat_id": chat_id, "text": texto}
    try:
        resp = requests.post(url, json=payload, timeout=10)
        if resp.status_code == 200:
            return True
        # Telegram's error responses are JSON with a human-readable
        # "description" field (e.g. "Bad Request: message is too long") --
        # surface that instead of just the bare status code.
        try:
            detalle = resp.json().get("description", "")
        except ValueError:
            detalle = ""
        if detalle:
            print(f"Error de Telegram ({resp.status_code}): {detalle}")
        else:
            print(f"Error de Telegram: HTTP {resp.status_code}")
        return False
    except requests.exceptions.Timeout:
        print("Error: tiempo de espera agotado al contactar Telegram.")
        return False
    except requests.exceptions.ConnectionError:
        print("Error: no se pudo conectar a Telegram. Verificar conexión a internet.")
        return False
    except requests.exceptions.RequestException as e:
        print(f"Error inesperado al enviar mensaje: {e}")
        return False
