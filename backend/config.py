from pydantic_settings import BaseSettings


# reads env variables automatically
class Settings(BaseSettings):
    supabase_url: str
    supabase_key: str
    clerk_pem_public_key: str
    clerk_issuer: str

    model_config = {"env_file": ".env"}


settings = Settings()
