from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    DATABASE_URL: str = "sqlite+aiosqlite:///./chat.db"
    SECRET_KEY: str = "change-this-secret"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    # Allowed client origins — add more when deploying (e.g. Cloud Run client URL)
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",   # python -m http.server
        "http://localhost:5173",   # Vite dev (future)
        "http://127.0.0.1:3000",
    ]


settings = Settings()

