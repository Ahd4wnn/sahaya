"""Application settings. Every secret comes from backend/.env, which is gitignored."""

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    APP_ENV: Literal["development", "staging", "production"] = "development"
    SECRET_KEY: str = "dev-only-change-me"
    CORS_ORIGINS: str = "http://localhost:5173"

    DATABASE_URL: str = "postgresql+asyncpg://postgres:@localhost:5432/sahaya"

    ACCESS_TOKEN_MINUTES: int = 15
    REFRESH_TOKEN_DAYS: int = 30

    # --- provider selection: the entire migration seam lives in these five vars ---
    EMAIL_BACKEND: Literal["console", "smtp"] = "console"
    SMS_BACKEND: Literal["console", "msg91"] = "console"
    STORAGE_BACKEND: Literal["local", "s3"] = "local"
    IMAGING_BACKEND: Literal["rembg", "noop"] = "rembg"
    ASSISTANT_BACKEND: Literal["openai", "none"] = "openai"

    STORAGE_LOCAL_DIR: str = "var/uploads"
    STORAGE_PUBLIC_BASE: str = "/media"

    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "Sahaya <no-reply@sahaya.app>"

    MSG91_AUTH_KEY: str = ""
    MSG91_SENDER_ID: str = ""
    MSG91_DLT_TE_ID: str = ""

    GOOGLE_CLIENT_ID: str = ""
    APPLE_CLIENT_ID: str = ""

    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""
    RAZORPAY_WEBHOOK_SECRET: str = ""

    # --- OTP policy (see docs/04-auth-flows.md) ---
    OTP_LENGTH: int = 6
    OTP_TTL_MINUTES: int = 10
    OTP_MAX_ATTEMPTS: int = 5

    SUBSCRIPTION_AMOUNT_PAISE: int = Field(default=9900, description="Rs 99.00")

    # --- Ask Sahaya, the in-chat assistant (docs/DECISIONS.md 023) ---
    #: The key is the only switch. With it empty the provider reports itself
    #: unavailable, the pinned thread never appears, and the endpoints answer
    #: 503 -- so the feature ships dark and lights up when a key is pasted in.
    OPENAI_API_KEY: str = ""
    ASSISTANT_MODEL: str = "gpt-5-nano"
    #: Per account per day. The cap is what keeps the bill predictable.
    ASSISTANT_DAILY_MESSAGE_LIMIT: int = 40
    #: Turns of history sent with each message -- the rest stays in the table.
    ASSISTANT_HISTORY_TURNS: int = 20
    ASSISTANT_MAX_OUTPUT_TOKENS: int = 700
    ASSISTANT_TIMEOUT_SECONDS: float = 30.0

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
