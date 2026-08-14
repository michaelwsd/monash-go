"""Clerk JWT verification. Tokens are self-signed with the session keypair,
so no network and no real credentials."""

from collections.abc import Callable

import pytest

from app.core import security
from app.exceptions.errors import InvalidCredentialsError
from tests.conftest import TEST_ISSUER, fake_settings


@pytest.fixture(autouse=True)
def settings_with_real_key(monkeypatch: pytest.MonkeyPatch, rsa_keys: tuple[str, str]) -> None:
    """fake_settings carries a dummy PEM. swap in the real public key so
    signature verification can actually succeed"""
    _, public_pem = rsa_keys
    settings = fake_settings().model_copy(
        update={"clerk_pem_public_key": public_pem, "clerk_issuer": TEST_ISSUER}
    )
    monkeypatch.setattr(security, "get_settings", lambda: settings)


def test_valid_token_returns_the_subject(make_token: Callable[..., str]) -> None:
    token = make_token(sub="user_2abc123")

    assert security.verify_clerk_token(token) == "user_2abc123"


def test_expired_token_is_rejected(make_token: Callable[..., str]) -> None:
    token = make_token(expires_in=-60)

    with pytest.raises(InvalidCredentialsError):
        security.verify_clerk_token(token)


def test_wrong_issuer_is_rejected(make_token: Callable[..., str]) -> None:
    token = make_token(issuer="https://attacker.example.com")

    with pytest.raises(InvalidCredentialsError):
        security.verify_clerk_token(token)


def test_token_signed_with_another_key_is_rejected(
    make_token: Callable[..., str], untrusted_private_key: str
) -> None:
    token = make_token(signing_key=untrusted_private_key)

    with pytest.raises(InvalidCredentialsError):
        security.verify_clerk_token(token)
