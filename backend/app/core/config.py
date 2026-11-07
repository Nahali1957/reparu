from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    mysql_host: str = "db"
    mysql_port: int = 3306
    mysql_database: str = "reparu"
    mysql_user: str = "reparu"
    mysql_password: str = ""
    database_url: str | None = None

    jwt_secret: str = "dev-only-secret"
    jwt_session_hours: int = 8
    jwt_remember_days: int = 30
    cors_origins: str = "http://localhost:5180"

    data_dir: str = "/data"

    # IoT (M6) : client MQTT désactivé si mqtt_host est vide (tests)
    mqtt_host: str | None = None
    mqtt_port: int = 8883
    mqtt_user: str = "backend"
    mqtt_backend_password: str = ""
    mqtt_ca: str = "/certs/ca.crt"
    iot_periode_s: int = 21600

    @property
    def sqlalchemy_url(self) -> str:
        if self.database_url:
            return self.database_url
        return (
            f"mysql+pymysql://{self.mysql_user}:{self.mysql_password}"
            f"@{self.mysql_host}:{self.mysql_port}/{self.mysql_database}?charset=utf8mb4"
        )

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
