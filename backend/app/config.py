import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://skillhub:changeme@localhost:5432/skill_nexus_hub"
    secret_key: str = "changeme"
    cors_origins: str = "http://localhost:9090"
    data_dir: str = "/data/skills"
    cli_dir: str = "/data/cli"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days
    trusted_proxies: str = ""

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }

    @property
    def allowed_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def trusted_proxy_list(self) -> list[str]:
        return [p.strip() for p in self.trusted_proxies.split(",") if p.strip()]


settings = Settings()

if os.getenv("ENV", "dev") != "dev" and settings.secret_key == "changeme":
    raise SystemExit("FATAL: SECRET_KEY must be changed from default in production")
