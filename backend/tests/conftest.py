from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.core.config import Settings, get_settings
from app.main import app


def fake_settings() -> Settings:
    return Settings(
        supabase_url="https://example.supabase.co",
        supabase_key=SecretStr("test-key"),
        clerk_pem_public_key="test-pem",
        clerk_issuer="https://example.clerk.accounts.dev",
        google_maps_api_key=SecretStr("test-maps-key"),
        environment="development",
        cors_origins=["http://localhost:3000"],
    )


@pytest.fixture
def client() -> Iterator[TestClient]:
    app.dependency_overrides[get_settings] = fake_settings
    yield TestClient(app)
    app.dependency_overrides.clear()
