import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings


def _get_fernet() -> Fernet:
    if settings.credential_encryption_key:
        key = settings.credential_encryption_key.encode()
    else:
        # Chave derivada apenas para desenvolvimento local.
        # Em produção, use CREDENTIAL_ENCRYPTION_KEY fixa para não perder acesso às senhas após troca de segredo.
        seed = f"{settings.app_name}:{settings.mysql_password}".encode()
        key = base64.urlsafe_b64encode(hashlib.sha256(seed).digest())

    return Fernet(key)


def encrypt_secret(value: str | None) -> str | None:
    if value is None or value == "":
        return value
    return _get_fernet().encrypt(value.encode()).decode()


def decrypt_secret(value: str | None) -> str | None:
    if value is None or value == "":
        return value
    try:
        return _get_fernet().decrypt(value.encode()).decode()
    except InvalidToken as exc:
        raise ValueError("Não foi possível descriptografar a credencial. Verifique CREDENTIAL_ENCRYPTION_KEY.") from exc
