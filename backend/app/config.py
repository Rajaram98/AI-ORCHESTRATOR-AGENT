from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://orchestrator:orchestrator@localhost:5432/orchestrator"
    redis_url: str = "redis://localhost:6379/0"
    openai_api_key: str = ""
    default_model: str = "gpt-4o-mini"
    telegram_bot_token: str = ""
    telegram_polling: bool = True
    log_level: str = "INFO"


settings = Settings()
