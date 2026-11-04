from pydantic_settings import BaseSettings
from sqlalchemy.engine import URL


class Settings(BaseSettings):
    app_name: str = "RabbitMQ Monitor Portal"
    app_env: str = "development"
    app_debug: bool = True
    auto_db_bootstrap: bool = True  # Docker Compose legacy; false in Kubernetes after MySQL init SQL.

    mysql_host: str = "mysql"
    mysql_port: int = 3306
    mysql_database: str = "rabbitmq_monitor_portal"
    mysql_user: str = "app"
    mysql_password: str = "app_password"

    redis_host: str = "redis"
    redis_port: int = 6379
    redis_db: int = 0

    ldap_host: str = "ldap"
    ldap_port: int = 389
    ldap_bind_dn: str = "cn=admin,dc=example,dc=local"
    ldap_bind_password: str = "admin"
    ldap_search_base: str = "ou=People,dc=example,dc=local"
    ldap_use_ssl: bool = False
    ldap_start_tls: bool = False
    ldap_tls_verify: bool = True
    ldap_demo_mode: bool = False  # temporary DEV-only override; see LDAPDirectoryClient
    ldap_search_filter: str = "(&(objectClass=user)(objectCategory=person))"
    ldap_require_org_unit: bool = True  # division OU department preenchido
    ldap_connect_timeout: int = 10

    # Web OIDC / Entra (valor real vem do Azure DevOps Library)
    entra_tenant_id: str = ""
    entra_client_id: str = ""
    entra_client_secret: str = ""
    entra_redirect_uri: str = ""
    entra_admin_app_role: str = "Portal.Admin"
    entra_admin_group_id: str = ""
    entra_observability_group_id: str = ""  # Object ID do grupo Entra autorizado a gerenciar clusters
    entra_observability_app_role: str = "Portal.Observability"
    entra_groups_source: str = "graph"  # graph ou token (compatibilidade)
    entra_graph_scopes: str = "User.Read"
    entra_groups_cache_ttl: int = 300
    session_ttl_seconds: int = 28800
    session_cookie_secure: bool = True
    local_admin_enabled: bool = False
    local_admin_password_hash: str = ""  # hash Argon2, NUNCA senha em texto
    auth_enabled: bool = True

    directory_cache_refresh_interval_seconds: int = 86400
    discovery_scheduler_interval_seconds: int = 86400
    removed_queue_cleanup_interval_seconds: int = 86400
    datadog_sync_interval_seconds: int = 86400  # legado, desativado na v0.5.6
    datadog_sync_poll_seconds: int = 3
    datadog_sync_max_attempts: int = 8
    datadog_reconcile_interval_seconds: int = 86400
    datadog_reconcile_poll_seconds: int = 10
    removed_queue_retention_days: int = 60

    rabbitmq_demo_host: str = "rabbitmq"
    rabbitmq_demo_port: int = 15672
    rabbitmq_demo_username: str = "guest"
    rabbitmq_demo_password: str = "guest"

    cors_origins: str = "http://localhost:3000,http://localhost:5173"
    portal_public_base_url: str = "http://localhost:3000"

    # Fernet key opcional. Em produção, defina uma chave fixa e segura.
    # Gere com: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    credential_encryption_key: str | None = None

    @property
    def database_url(self) -> URL:
        # URL.create evita erros de parsing quando as credenciais incluem
        # @, /, #, %, : ou outros caracteres especiais da Azure DevOps Library.
        return URL.create(
            drivername="mysql+pymysql",
            username=self.mysql_user,
            password=self.mysql_password,
            host=self.mysql_host,
            port=self.mysql_port,
            database=self.mysql_database,
            query={"charset": "utf8mb4"},
        )

    @property
    def redis_url(self) -> str:
        return f"redis://{self.redis_host}:{self.redis_port}/{self.redis_db}"

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
