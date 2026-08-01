import pytest
import requests
from unittest.mock import patch, MagicMock
from telegram_client import enviar_mensaje

# patch target is the module where requests.post is *called*, not where it's
# imported from the shim. After P4-1, that's tango_cifrado.telegram.
_PATCH = "tango_cifrado.telegram.requests.post"


def test_enviar_mensaje_exitoso():
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    with patch(_PATCH, return_value=mock_resp) as mock_post:
        result = enviar_mensaje("TOKEN", "123", "hola")
        assert result is True
        mock_post.assert_called_once()
        _, kwargs = mock_post.call_args
        assert kwargs["json"]["chat_id"] == "123"
        assert kwargs["json"]["text"] == "hola"


def test_enviar_mensaje_fallo_http():
    mock_resp = MagicMock()
    mock_resp.status_code = 400
    with patch(_PATCH, return_value=mock_resp):
        result = enviar_mensaje("TOKEN", "123", "hola")
        assert result is False


def test_enviar_mensaje_sin_token_lanza_error():
    with pytest.raises(ValueError):
        enviar_mensaje("", "123", "hola")


def test_enviar_mensaje_sin_chat_id_lanza_error():
    with pytest.raises(ValueError):
        enviar_mensaje("TOKEN", "", "hola")


def test_url_contiene_token():
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    with patch(_PATCH, return_value=mock_resp) as mock_post:
        enviar_mensaje("MI_TOKEN", "123", "test")
        url = mock_post.call_args[0][0]
        assert "MI_TOKEN" in url


def test_timeout_retorna_false():
    with patch(_PATCH, side_effect=requests.exceptions.Timeout):
        assert enviar_mensaje("TOKEN", "123", "hola") is False


def test_connection_error_retorna_false():
    with patch(_PATCH, side_effect=requests.exceptions.ConnectionError):
        assert enviar_mensaje("TOKEN", "123", "hola") is False


def test_request_exception_retorna_false():
    with patch(_PATCH, side_effect=requests.exceptions.RequestException("fail")):
        assert enviar_mensaje("TOKEN", "123", "hola") is False
