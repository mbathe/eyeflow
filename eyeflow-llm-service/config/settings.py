from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """
    Application Configuration - Minimal
    LLM configuration is fetched from NestJS /api/llm-config/default endpoint.
    This ensures single source of truth for LLM settings.
    """

    # Server Configuration
    SERVER_HOST: str = "0.0.0.0"
    SERVER_PORT: int = 8000
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"

    # NestJS Integration
    NESTJS_SERVER_URL: str = "http://localhost:3000"
    USER_ID: str = "system"  # Used for X-User-ID header when fetching from NestJS

    # LLM API Keys (Fallback - used if not in NestJS config)
    ANTHROPIC_API_KEY: Optional[str] = None
    OPENAI_API_KEY: Optional[str] = None

    # Configuration Cache TTL
    CONFIG_FETCH_INTERVAL_MINUTES: int = 60
    CONTEXT_FETCH_INTERVAL_MINUTES: int = 60

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()

