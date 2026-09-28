from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "RabbitMQ Monitor Portal"
    app_env: str = "development"
    app_debug: bool = True

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
    directory_cache_refresh_interval_seconds: int = 86400
    discovery_scheduler_interval_seconds: int = 86400
    removed_queue_cleanup_interval_seconds: int = 86400
    datadog_sync_interval_seconds: int = 86400
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
    def database_url(self) -> str:
        return (
            f"mysql+pymysql://{self.mysql_user}:{self.mysql_password}"
            f"@{self.mysql_host}:{self.mysql_port}/{self.mysql_database}?charset=utf8mb4"
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
