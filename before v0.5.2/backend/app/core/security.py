import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings


def _derive_fernet_key(seed: str) -> bytes:
    return base64.urlsafe_b64encode(hashlib.sha256(seed.encode()).digest())


def _build_fernet(key: str | bytes) -> Fernet:
    if isinstance(key, str):
        key = key.encode()
    return Fernet(key)


def _primary_fernet() -> Fernet:
    if settings.credential_encryption_key:
        return _build_fernet(settings.credential_encryption_key)

    # Chave estável apenas para desenvolvimento local.
    # Não usa APP_NAME, porque API, worker e scheduler podem ter nomes diferentes.
    return _build_fernet(
        _derive_fernet_key(
            f"rabbitmq-monitor-portal:{settings.mysql_database}:{settings.mysql_user}:{settings.mysql_password}"
        )
    )


def _candidate_fernets() -> list[Fernet]:
    candidates: list[Fernet] = [_primary_fernet()]
    used_keys: set[bytes] = {candidates[0]._signing_key + candidates[0]._encryption_key}

    # Compatibilidade com versões anteriores do ambiente local, onde a chave
    # derivada dependia do APP_NAME. Isso permite que o worker leia credenciais
    # criadas pela API antes desta correção, sem precisar recriar o banco.
    legacy_seeds = [
        f"RabbitMQ Monitor Portal:{settings.mysql_password}",
        f"RabbitMQ Monitor Portal Worker:{settings.mysql_password}",
        f"RabbitMQ Monitor Portal Scheduler:{settings.mysql_password}",
        f"{settings.app_name}:{settings.mysql_password}",
    ]
    for seed in legacy_seeds:
        try:
            fernet = _build_fernet(_derive_fernet_key(seed))
        except Exception:
            continue
        key_marker = fernet._signing_key + fernet._encryption_key
        if key_marker not in used_keys:
            used_keys.add(key_marker)
            candidates.append(fernet)

    return candidates


def encrypt_secret(value: str | None) -> str | None:
    if value is None or value == "":
        return value
    return _primary_fernet().encrypt(value.encode()).decode()


def decrypt_secret(value: str | None) -> str | None:
    if value is None or value == "":
        return value

    for fernet in _candidate_fernets():
        try:
            return fernet.decrypt(value.encode()).decode()
        except InvalidToken:
            continue

    raise ValueError(
        "Não foi possível descriptografar a credencial. Verifique se API, worker e scheduler usam a mesma CREDENTIAL_ENCRYPTION_KEY."
    )
