"""CurrentUser end to end, on a throwaway app.

Not mounted on the real app: POST /users/sync in Sprint 2 is the first real
protected endpoint.
"""

from collections.abc import Callable

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.deps import CurrentUser
from app.core import security
from app.exceptions.handlers import register_exception_handlers
from tests.conftest import TEST_ISSUER, fake_settings


@pytest.fixture
def protected(
    monkeypatch: pytest.MonkeyPatch, rsa_keys: tuple[str, str]
) -> tuple[TestClient, list[str]]:
    """A one-route app plus a list recording every call that reached the body."""
    _, public_pem = rsa_keys
    settings = fake_settings().model_copy(
        update={"clerk_pem_public_key": public_pem, "clerk_issuer": TEST_ISSUER}
    )
    # in the app.core.security module, replace the name get_settings with a function that returns fake settings
    monkeypatch.setattr(security, "get_settings", lambda: settings)

    reached: list[str] = []
    test_app = FastAPI()
    register_exception_handlers(test_app)

    # set up a fake route that returns the userid
    @test_app.get("/protected")
    async def route(user: CurrentUser) -> dict[str, str]:
        reached.append(user)
        return {"clerk_id": user}

    return TestClient(test_app), reached


def test_no_token_is_rejected_before_the_route_runs(
    protected: tuple[TestClient, list[str]],
) -> None:
    client, reached = protected

    response = client.get("/protected")

    assert response.status_code == 401
    assert reached == []  # the body never ran


def test_valid_token_reaches_the_route_with_the_right_id(
    protected: tuple[TestClient, list[str]], make_token: Callable[..., str]
) -> None:
    client, reached = protected
    token = make_token(sub="user_2abc123")

    response = client.get("/protected", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json() == {"clerk_id": "user_2abc123"}
    assert reached == ["user_2abc123"]