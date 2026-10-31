from functools import lru_cache
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


DEVELOPMENT_JWT_SECRET = "freshflow-development-secret-change-before-deploy-2026"
DEVELOPMENT_JWT_SECRETS = {
    DEVELOPMENT_JWT_SECRET,
    "local-development-secret-replace-before-deploy",
    "replace-with-generated-random-secret-at-least-32-characters",
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "FreshFlow API"
    environment: str = "development"
    api_v1_prefix: str = "/api/v1"
    database_url: str = "sqlite:///./freshflow.db"
    jwt_secret: str = Field(default=DEVELOPMENT_JWT_SECRET, min_length=32)
    access_token_minutes: int = 60
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000"]
    ws_allowed_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000"]
    otp_debug: bool = False

    @field_validator("cors_origins", "ws_allowed_origins", mode="before")
    @classmethod
    def split_origins(cls, value):
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
