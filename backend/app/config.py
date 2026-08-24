"""Application configuration — reads from environment variables."""
from __future__ import annotations

from typing import List, Union
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
        extra="ignore",
    )

    APP_ENV: str = "development"
    APP_SECRET_KEY: str = "dev-secret-change-in-production"
    CORS_ORIGINS: Union[List[str], str] = ["*"]

    DATABASE_URL: str = "postgresql+asyncpg://feuji:feuji_pass@localhost:5435/llmkit"
    REDIS_URL: str = "redis://localhost:6379/0"

    AZURE_OPENAI_ENDPOINT: str = ""
    AZURE_OPENAI_API_KEY: str = ""
    AZURE_OPENAI_DEPLOYMENT: str = "gpt-4o"
    AZURE_OPENAI_API_VERSION: str = "2024-02-01"

    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_DEFAULT_REGION: str = "us-east-1"
    AWS_BEDROCK_MODEL_ID: str = "anthropic.claude-3-sonnet-20240229-v1:0"

    TF_STATE_BUCKET: str = "feuji-tfstate"
    TF_ARTIFACTS_BUCKET: str = "feuji-tf-artifacts"
    TF_WORKSPACE_PATH: str = "/tmp/tf_workspace"

    OPTIMA_SCAN_INTERVAL_MINUTES: int = 60

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        if v is None or v == "":
            return ["*"]
        if isinstance(v, list):
            return [str(x).strip() for x in v if str(x).strip()]
        if isinstance(v, str):
            s = v.strip().strip("'").strip('"')
            if s.startswith("["):
                import json
                try:
                    parsed = json.loads(s)
                    if isinstance(parsed, list):
                        return [str(x).strip() for x in parsed if str(x).strip()]
                except Exception:
                    pass
            if s == "*":
                return ["*"]
            return [part.strip() for part in s.split(",") if part.strip()]
        return ["*"]

    @property
    def cors_allow_origins(self) -> List[str]:
        origins = self.CORS_ORIGINS
        if isinstance(origins, str):
            origins = [origins]
        return origins or ["*"]

    @property
    def cors_allow_credentials(self) -> bool:
        return "*" not in self.cors_allow_origins

    @property
    def async_database_url(self) -> str:
        """Normalize Neon/Render Postgres URLs for SQLAlchemy + asyncpg."""
        url = (self.DATABASE_URL or "").strip().strip("'").strip('"')
        if not url:
            return "postgresql+asyncpg://localhost/llmkit"

        if url.startswith("postgres://"):
            url = "postgresql+asyncpg://" + url[len("postgres://"):]
        elif url.startswith("postgresql://") and not url.startswith("postgresql+asyncpg://"):
            url = "postgresql+asyncpg://" + url[len("postgresql://"):]

        parsed = urlparse(url)
        drop = {"channel_binding", "sslmode"}
        query_items = [
            (k, v) for k, v in parse_qsl(parsed.query, keep_blank_values=True)
            if k.lower() not in drop
        ]

        host = (parsed.hostname or "").lower()
        needs_ssl = "neon.tech" in host or "render.com" in host
        # asyncpg/SQLAlchemy accept ssl=require (NOT ssl=true — that becomes invalid sslmode=true)
        if needs_ssl and not any(k.lower() == "ssl" for k, _ in query_items):
            query_items.append(("ssl", "require"))
        else:
            # Normalize any ssl=true leftovers
            query_items = [
                (k, "require" if k.lower() == "ssl" and str(v).lower() in ("true", "1", "yes") else v)
                for k, v in query_items
            ]

        return urlunparse(parsed._replace(query=urlencode(query_items)))


settings = Settings()
