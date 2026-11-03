"""Configure .env.local; requer `pip install argon2-cffi cryptography` no host.
A senha é solicitada no console sem eco. Não publica nem envia credenciais.
"""
from pathlib import Path
import getpass
from argon2 import PasswordHasher
from cryptography.fernet import Fernet

root=Path(__file__).resolve().parents[1]
dest=root/'.env.local'
if dest.exists():
    raise SystemExit('.env.local já existe; preserve suas chaves e senha. Não sobreescrever.')
senha=getpass.getpass('Escolha a senha do administrador local: ')
if len(senha)<12:
    raise SystemExit('Senha mínima: 12 caracteres.')
template=(root/'.env.local.example').read_text(encoding='utf-8')
# Strings entre aspas simples no .env são literais para evitar expansão de $argon2id$.
template=template.replace('LOCAL_ADMIN_PASSWORD_HASH=', "LOCAL_ADMIN_PASSWORD_HASH='"+PasswordHasher().hash(senha)+"'")
template=template.replace('CREDENTIAL_ENCRYPTION_KEY=','CREDENTIAL_ENCRYPTION_KEY='+Fernet.generate_key().decode())
dest.write_text(template,encoding='utf-8')
print('Arquivo .env.local criado. Não altere CREDENTIAL_ENCRYPTION_KEY após cadastrar dados.')
