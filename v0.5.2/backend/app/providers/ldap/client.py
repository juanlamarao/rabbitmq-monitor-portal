from typing import Any

from ldap3 import ALL, Connection, Server

from app.core.config import settings


class LDAPDirectoryClient:
    def __init__(self):
        self.server = Server(settings.ldap_host, port=settings.ldap_port, use_ssl=settings.ldap_use_ssl, get_info=ALL)

    def list_people(self) -> list[dict[str, str]]:
        with Connection(
            self.server,
            user=settings.ldap_bind_dn,
            password=settings.ldap_bind_password,
            auto_bind=True,
            receive_timeout=10,
        ) as conn:
            conn.search(
                search_base=settings.ldap_search_base,
                search_filter="(objectClass=inetOrgPerson)",
                attributes=["givenName", "sn", "cn", "mail"],
            )
            people: list[dict[str, str]] = []
            for entry in conn.entries:
                data: dict[str, Any] = entry.entry_attributes_as_dict
                email = _first(data.get("mail"))
                if not email:
                    continue
                first_name = _first(data.get("givenName"))
                last_name = _first(data.get("sn"))
                full_name = _first(data.get("cn")) or " ".join(item for item in [first_name, last_name] if item)
                people.append(
                    {
                        "first_name": first_name,
                        "last_name": last_name,
                        "full_name": full_name,
                        "email": email.lower(),
                    }
                )
            people.sort(key=lambda item: item["email"])
            return people


def _first(value: Any) -> str:
    if isinstance(value, list):
        return str(value[0]) if value else ""
    return str(value or "")
