import pytest
from pydantic import ValidationError

from app.core.config import Settings

# Every required field, as the raw strings the environment would actually supply
BASE_ENV = {
    "SUPABASE_URL": "https://example.supabase.co",
    "SUPABASE_KEY": "test-key",
    "CLERK_PEM_PUBLIC_KEY": "test-pem",
    "CLERK_ISSUER": "https://example.clerk.accounts.dev",
    "GOOGLE_MAPS_API_KEY": "test-maps-key",
    "CORS_ORIGINS": '["http://localhost:3000"]',
}


@pytest.fixture
def env(monkeypatch: pytest.MonkeyPatch) -> pytest.MonkeyPatch:
    for key, value in BASE_ENV.items():
        monkeypatch.setenv(key, value)
    return monkeypatch


def test_parses_cors_origins_from_json(env: pytest.MonkeyPatch) -> None:
    settings = Settings(_env_file=None)

    assert settings.cors_origins == ["http://localhost:3000"]


def test_environment_defaults_to_development(env: pytest.MonkeyPatch) -> None:
    settings = Settings(_env_file=None)

    assert settings.environment == "development"


def test_missing_required_field_raises(env: pytest.MonkeyPatch) -> None:
    env.delenv("SUPABASE_URL")

    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_invalid_environment_raises(env: pytest.MonkeyPatch) -> None:
    env.setenv("ENVIRONMENT", "prod")

    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_secrets_are_masked_in_repr(env: pytest.MonkeyPatch) -> None:
    settings = Settings(_env_file=None)

    assert "test-key" not in repr(settings)
    assert settings.supabase_key.get_secret_value() == "test-key"
