from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/ - resolved from this file so the env file loads regardless of cwd
# core -> app -> backend
BACKEND_DIR = Path(__file__).resolve().parents[2]


# a method to retrieve env, but with validation and conversion
class Settings(BaseSettings):
    supabase_url: str
    supabase_key: SecretStr
    supabase_anon_key: SecretStr
    clerk_pem_public_key: str
    clerk_issuer: str
    google_maps_api_key: SecretStr
    servo_saver_api_key: SecretStr
    environment: Literal["development", "staging", "production"] = "development"
    cors_origins: list[str]

    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="forbid")


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    return settings
