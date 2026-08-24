"""Application configuration — reads from environment variables."""
from __future__ import annotations

from typing import List, Union

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
        extra="ignore",
    )

    # App
    APP_ENV: str = "development"
    APP_SECRET_KEY: str = "dev-secret-change-in-production"
    # Accept JSON list, comma-separated string, or "*" from Render / Vercel env
    CORS_ORIGINS: Union[List[str], str] = [
        "*",
        "http://localhost:3000",
        "http://localhost:3050",
        "http://localhost:3177",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3050",
        "http://127.0.0.1:3177",
        "http://localhost:5173",
    ]

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://feuji:feuji_pass@localhost:5435/llmkit"
    REDIS_URL: str = "redis://localhost:6379/0"

    # Azure OpenAI
    AZURE_OPENAI_ENDPOINT: str = ""
    AZURE_OPENAI_API_KEY: str = ""
    AZURE_OPENAI_DEPLOYMENT: str = "gpt-4o"
    AZURE_OPENAI_API_VERSION: str = "2024-02-01"

    # AWS Bedrock
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_DEFAULT_REGION: str = "us-east-1"
    AWS_BEDROCK_MODEL_ID: str = "anthropic.claude-3-sonnet-20240229-v1:0"

    # Terraform
    TF_STATE_BUCKET: str = "feuji-tfstate"
    TF_ARTIFACTS_BUCKET: str = "feuji-tf-artifacts"
    TF_WORKSPACE_PATH: str = "/tmp/tf_workspace"

    # OPTIMA-AI
    OPTIMA_SCAN_INTERVAL_MINUTES: int = 60

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        if v is None or v == "":
            return ["*"]
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            s = v.strip()
            if s.startswith("["):
                import json
                try:
                    return json.loads(s)
                except Exception:
                    pass
            if s == "*":
                return ["*"]
            return [part.strip() for part in s.split(",") if part.strip()]
        return v

    @property
    def cors_allow_origins(self) -> List[str]:
        origins = self.CORS_ORIGINS
        if isinstance(origins, str):
            origins = [origins]
        return origins or ["*"]

    @property
    def cors_allow_credentials(self) -> bool:
        # Starlette forbids allow_credentials=True together with allow_origins=["*"]
        return "*" not in self.cors_allow_origins

    @property
    def async_database_url(self) -> str:
        """Normalize provider URLs (Neon/Render) for SQLAlchemy asyncpg."""
        url = (self.DATABASE_URL or "").strip()
        if url.startswith("postgres://"):
            url = "postgresql+asyncpg://" + url[len("postgres://"):]
        elif url.startswith("postgresql://") and not url.startswith("postgresql+asyncpg://"):
            url = "postgresql+asyncpg://" + url[len("postgresql://"):]

        # Neon / managed Postgres require TLS; asyncpg uses ssl=true query param
        lower = url.lower()
        if "neon.tech" in lower or "sslmode=require" in lower:
            if "ssl=" not in lower and "sslmode=" not in lower:
                url += ("&" if "?" in url else "?") + "ssl=true"
            # asyncpg does not use sslmode=; map common Neon query to ssl=true
            url = url.replace("sslmode=require", "ssl=true").replace("sslmode=required", "ssl=true")
        return url


settings = Settings()
