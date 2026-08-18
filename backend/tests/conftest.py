from collections.abc import Callable, Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    NoEncryption,
    PrivateFormat,
    PublicFormat,
)
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.core.config import Settings, get_settings
from app.main import app

TEST_ISSUER = "https://example.clerk.accounts.dev"


def fake_settings() -> Settings:
    return Settings(
        supabase_url="https://example.supabase.co",
        supabase_key=SecretStr("test-key"),
        supabase_anon_key=SecretStr("anon-key"),
        clerk_pem_public_key="test-pem",
        clerk_issuer=TEST_ISSUER,
        google_maps_api_key=SecretStr("test-maps-key"),
        servo_saver_api_key=SecretStr("test-servo-key"),
        environment="development",
        cors_origins=["http://localhost:3000"],
    )


# create a client with fake env to run tests
@pytest.fixture
def client() -> Iterator[TestClient]:
    app.dependency_overrides[get_settings] = fake_settings
    yield TestClient(app)  # passed in as client to tests, matches by name (client)
    app.dependency_overrides.clear()


def _generate_keypair() -> tuple[str, str]:
    """(private_pem, public_pem) for a throwaway 2048-bit RSA key"""
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = key.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption()).decode()
    public_pem = (
        key.public_key().public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo).decode()
    )
    return private_pem, public_pem


# session scope: generating a key costs ~100ms and the result is immutable
@pytest.fixture(scope="session")
def rsa_keys() -> tuple[str, str]:
    """stands in for Clerk's key. private half signs, public half verifies"""
    return _generate_keypair()


@pytest.fixture(scope="session")
def untrusted_private_key() -> str:
    """an attacker's key. tokens signed with it must never be accepted"""
    private_pem, _ = _generate_keypair()
    return private_pem


@pytest.fixture(scope="session")
def make_token(rsa_keys: tuple[str, str]) -> Callable[..., str]:
    """signs a token. every argument defaults to a valid value, so each test
    overrides only the thing it is attacking"""
    private_pem, _ = rsa_keys

    def _make(
        *,
        sub: str | None = "user_2abc123",
        issuer: str | None = TEST_ISSUER,
        email: str | None = "test@student.monash.edu",
        full_name: str | None = "Test User",
        expires_in: int = 3600,
        signing_key: str | None = None,
    ) -> str:
        now = datetime.now(tz=UTC)
        payload: dict[str, Any] = {
            "iat": now,
            "exp": now + timedelta(seconds=expires_in),
        }
        # None means omit the claim entirely, so "required claim missing" is
        # testable and not just "claim has the wrong value"
        for key, value in (
            ("sub", sub),
            ("iss", issuer),
            ("email", email),
            ("full_name", full_name),
        ):
            if value is not None:
                payload[key] = value
        return jwt.encode(payload, signing_key or private_pem, algorithm="RS256")

    return _make
