import requests


def enviar_mensaje(bot_token, chat_id, texto):
    """Envía un mensaje de texto al chat indicado via Telegram Bot API.

    Returns True si el envío fue exitoso, False si hubo error HTTP o de red.
    Raises ValueError si faltan credenciales.
    """
    if not bot_token or not chat_id:
        raise ValueError("bot_token y chat_id son obligatorios")

    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {"chat_id": chat_id, "text": texto}
    try:
        resp = requests.post(url, json=payload, timeout=10)
        return resp.status_code == 200
    except requests.exceptions.Timeout:
        print("Error: tiempo de espera agotado al contactar Telegram.")
        return False
    except requests.exceptions.ConnectionError:
        print("Error: no se pudo conectar a Telegram. Verificar conexión a internet.")
        return False
    except requests.exceptions.RequestException as e:
        print(f"Error inesperado al enviar mensaje: {e}")
        return False
