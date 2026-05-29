from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    supabase_url: str
    supabase_key: str
    clerk_pem_public_key: str
    clerk_issuer: str
    google_maps_api_key: str

    model_config = {"env_file": ".env"}


settings = Settings()
