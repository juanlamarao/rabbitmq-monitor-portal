"""Read-only, paginated AD LDAP sync, without adding LDAP infrastructure to EKS."""
import ssl
from ldap3 import Connection, Server, NONE, SIMPLE, Tls
from ldap3.core.exceptions import LDAPException
from app.core.config import settings

class LDAPDirectoryClient:
    def list_people(self) -> list[dict[str, str]]:
        if not settings.ldap_host or not settings.ldap_bind_dn or not settings.ldap_search_base:
            raise RuntimeError('LDAP corporativo não configurado: host/bind/search_base obrigatórios.')
        server=Server(settings.ldap_host,port=settings.ldap_port,use_ssl=settings.ldap_use_ssl,
                      get_info=NONE,connect_timeout=settings.ldap_connect_timeout, tls=Tls(validate=ssl.CERT_REQUIRED))
        people: dict[str,dict[str,str]]={}
        with Connection(server,user=settings.ldap_bind_dn,password=settings.ldap_bind_password,
                        authentication=SIMPLE,auto_bind=False,receive_timeout=30,raise_exceptions=True) as conn:
            if not conn.open():
                raise RuntimeError('Falha ao abrir conexão LDAP.')
            if settings.ldap_start_tls and not settings.ldap_use_ssl:
                conn.start_tls()
            conn.bind()
            # AD pode retornar no máximo 1000 entradas por pesquisa sem paginação.
            for entry in conn.extend.standard.paged_search(
                search_base=settings.ldap_search_base,
                search_filter=settings.ldap_search_filter,
                search_scope='SUBTREE',
                attributes=['sAMAccountName','mail','name','division','department'],
                paged_size=500,generator=True,
            ):
                if entry.get('type')!='searchResEntry':
                    continue
                attrs=entry.get('attributes',{})
                account=_value(attrs.get('sAMAccountName'))
                email=_value(attrs.get('mail'))
                full_name=_value(attrs.get('name'))
                if not all([account,email,full_name]):
                    continue
                a=account.casefold()
                if 'svc_' in a or '-adm' in a:
                    continue
                division=_value(attrs.get('division'))
                department=_value(attrs.get('department'))
                if settings.ldap_require_org_unit and not division and not department:
                    continue
                if '@' not in email:
                    continue
                first,last=(full_name.split(' ',1)+[''])[:2]
                people[email.lower()]={
                    'account_name':account,'email':email.lower(), 'full_name':full_name,
                    'first_name':first, 'last_name':last,
                }
        return sorted(people.values(),key=lambda p:p['email'])

def _value(value)->str:
    if isinstance(value,(list,tuple)):
        return str(value[0] or '').strip() if value else ''
    return str(value or '').strip()
