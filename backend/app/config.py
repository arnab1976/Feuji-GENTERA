"""Application configuration — reads from environment variables."""
from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # App
    APP_ENV: str = "development"
    APP_SECRET_KEY: str = "dev-secret-change-in-production"
    CORS_ORIGINS: List[str] = [
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

    class Config:
        env_file = ".env"
        case_sensitive = False
        extra = "ignore"

    @property
    def async_database_url(self) -> str:
        url = self.DATABASE_URL
        if url.startswith("postgres://"):
            return url.replace("postgres://", "postgresql+asyncpg://", 1)
        if url.startswith("postgresql://") and not url.startswith("postgresql+asyncpg://"):
            return url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return url


settings = Settings()
