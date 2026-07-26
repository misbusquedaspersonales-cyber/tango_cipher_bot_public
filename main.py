import os
from dotenv import load_dotenv
from private_core.cipher_engine import cargar_tangos, cifrar_mensaje, descifrar_mensaje
from telegram_client import enviar_mensaje

load_dotenv()

BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")
CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID")


if __name__ == "__main__":
    base = cargar_tangos("private_core/tangos.json")
    print("=== SISTEMA DE CIFRADO POR TANGOS (TELEGRAM) ===")
    id_tango = input("Ingrese la clave de Tango (ej: 3): ")
    mensaje = input("Ingrese el mensaje a enviar: ")

    try:
        # salt=None -> cifrar_mensaje resuelve CIFRADO_SALT del entorno,
        # o DEFAULT_SALT si no está definida. Ver cipher_engine._resolve_salt.
        codigo_cifrado = cifrar_mensaje(id_tango, mensaje, base, salt=None)
    except ValueError as e:
        print(f"Error al cifrar: {e}")
        exit(1)

    print(f"\nCódigo Cifrado Generado: {codigo_cifrado}")

    try:
        exito = enviar_mensaje(BOT_TOKEN, CHAT_ID, codigo_cifrado)
        print("Mensaje enviado con éxito a Telegram." if exito else "Error al enviar mensaje a Telegram.")
    except ValueError as e:
        print(f"Error de configuración: {e}")

    try:
        print("\nPrueba de descifrado en recepción:")
        print(f"Texto Descifrado: {descifrar_mensaje(codigo_cifrado, base)}")
    except ValueError as e:
        print(f"Error al descifrar: {e}")
