"""Cliente LDAP corporativo: leitura paginada de usuários do Active Directory.

O bind com credenciais ocorre apenas após estabelecer TLS (LDAPS ou StartTLS).
A opção de ignorar a validação do certificado só é permitida em development.
"""

import ssl

from ldap3 import (
    AUTO_BIND_NO_TLS,
    AUTO_BIND_TLS_BEFORE_BIND,
    Connection,
    NONE,
    SIMPLE,
    SUBTREE,
    Server,
    Tls,
)

from app.core.config import settings


class LDAPDirectoryClient:
    def list_people(self) -> list[dict[str, str]]:
        if not all(
            [
                settings.ldap_host,
                settings.ldap_bind_dn,
                settings.ldap_bind_password,
                settings.ldap_search_base,
            ]
        ):
            raise RuntimeError(
                "LDAP corporativo não configurado: host, bind, senha e search_base são obrigatórios."
            )

        if settings.ldap_use_ssl and settings.ldap_start_tls:
            raise RuntimeError("Configure LDAPS ou StartTLS, não os dois simultaneamente.")

        if not settings.ldap_use_ssl and not settings.ldap_start_tls:
            raise RuntimeError(
                "LDAP SIMPLE sem criptografia não permitido. Habilite LDAPS ou StartTLS."
            )

        if not settings.ldap_tls_verify and settings.app_env.lower() != "development":
            raise RuntimeError(
                "LDAP_TLS_VERIFY=false é permitido somente no ambiente development."
            )

        tls = Tls(
            validate=ssl.CERT_REQUIRED if settings.ldap_tls_verify else ssl.CERT_NONE
        )
        server = Server(
            settings.ldap_host,
            port=settings.ldap_port,
            use_ssl=settings.ldap_use_ssl,
            get_info=NONE,
            connect_timeout=settings.ldap_connect_timeout,
            tls=tls,
        )

        # No StartTLS, o ldap3 deve negociar TLS ANTES do bind SIMPLE.
        # Em LDAPS, o próprio Server(use_ssl=True) estabelece TLS no socket.
        bind_mode = (
            AUTO_BIND_TLS_BEFORE_BIND
            if settings.ldap_start_tls
            else AUTO_BIND_NO_TLS
        )

        conn = Connection(
            server,
            user=settings.ldap_bind_dn,
            password=settings.ldap_bind_password,
            authentication=SIMPLE,
            auto_bind=bind_mode,
            receive_timeout=30,
            raise_exceptions=True,
        )

        people: dict[str, dict[str, str]] = {}
        try:
            # A consulta ao AD deve ser paginada para não ficar limitada a 1000 usuários.
            for entry in conn.extend.standard.paged_search(
                search_base=settings.ldap_search_base,
                search_filter=settings.ldap_search_filter,
                search_scope=SUBTREE,
                attributes=[
                    "sAMAccountName",
                    "mail",
                    "name",
                    "division",
                    "department",
                ],
                paged_size=500,
                generator=True,
            ):
                if entry.get("type") != "searchResEntry":
                    continue

                attrs = entry.get("attributes") or {}
                account = _value(attrs.get("sAMAccountName"))
                email = _value(attrs.get("mail"))
                full_name = _value(attrs.get("name"))

                if not account or not email or not full_name:
                    continue

                account_lower = account.casefold()
                if "svc_" in account_lower or "-adm" in account_lower:
                    continue

                division = _value(attrs.get("division"))
                department = _value(attrs.get("department"))
                if settings.ldap_require_org_unit and not division and not department:
                    continue

                if "@" not in email:
                    continue

                first_name, _, last_name = full_name.partition(" ")
                email_lower = email.lower()
                people[email_lower] = {
                    "account_name": account,
                    "email": email_lower,
                    "full_name": full_name,
                    "first_name": first_name,
                    "last_name": last_name,
                }
        finally:
            conn.unbind()

        return sorted(people.values(), key=lambda person: person["email"])


def _value(value: object) -> str:
    if isinstance(value, (list, tuple)):
        return str(value[0] or "").strip() if value else ""
    return str(value or "").strip()
