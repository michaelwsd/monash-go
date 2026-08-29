"""POST /users/sync on the real app.

test_user_service.py already proves the sync logic. This proves the wiring the
service tests cannot see: the router mounts at /api/v1, the auth dependency
runs before the body, PermissionDeniedError becomes a 403, and UserResponse
keeps clerk_id off the wire. It also pins REQ-001's idempotency criterion at
the layer the frontend actually hits, since sync fires on every page load.

Persistence is faked, per sprint-2.md's "or a mocked repository at the route
level". Mocking Supabase to prove we called Supabase would test nothing.
"""

from collections.abc import Callable, Iterator
from datetime import UTC, datetime
from typing import cast
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app.core import security
from app.core.config import get_settings
from app.db.client import get_supabase
from app.main import app
from app.schemas.user import User
from app.services import user_service
from supabase import Client
from tests.conftest import TEST_ISSUER, fake_settings

SYNC_URL = "/api/v1/users/sync"


class FakeUserRepo:
    """One dict keyed by clerk_id, matching the real repository's contract -
    including create_if_absent returning None when the row already existed,
    which is the branch the race-condition path in sync depends on."""

    def __init__(self) -> None:
        self.rows: dict[str, User] = {}

    def get_by_clerk_id(self, db: object, clerk_id: str) -> User | None:
        return self.rows.get(clerk_id)

    def create_if_absent(
        self, db: object, *, clerk_id: str, email: str, full_name: str
    ) -> User | None:
        if clerk_id in self.rows:
            return None
        user = User(
            id=uuid4(),
            clerk_id=clerk_id,
            email=email,
            phone="",
            full_name=full_name,
            role="passenger",
            is_concession=False,
            home_campus=None,
            green_points=0,
            joined_at=datetime.now(tz=UTC),
        )
        self.rows[clerk_id] = user
        return user

    def update_clerk_fields(self, db: object, *, clerk_id: str, email: str, full_name: str) -> User:
        updated = self.rows[clerk_id].model_copy(update={"email": email, "full_name": full_name})
        self.rows[clerk_id] = updated
        return updated


class FakeRewardsRepo:
    def __init__(self) -> None:
        self.user_ids: set[UUID] = set()

    def create_if_absent(self, db: object, *, user_id: UUID) -> None:
        self.user_ids.add(user_id)


@pytest.fixture
def wired(
    monkeypatch: pytest.MonkeyPatch, rsa_keys: tuple[str, str]
) -> Iterator[tuple[TestClient, FakeUserRepo, FakeRewardsRepo]]:
    """The real app with real routing and real auth, over in-memory storage."""
    _, public_pem = rsa_keys
    settings = fake_settings().model_copy(
        update={"clerk_pem_public_key": public_pem, "clerk_issuer": TEST_ISSUER}
    )
    monkeypatch.setattr(security, "get_settings", lambda: settings)

    users, rewards = FakeUserRepo(), FakeRewardsRepo()
    monkeypatch.setattr(user_service, "user_repository", users)
    monkeypatch.setattr(user_service, "rewards_repository", rewards)

    app.dependency_overrides[get_settings] = fake_settings
    # the fakes never touch it, so there is nothing real to build
    app.dependency_overrides[get_supabase] = lambda: cast(Client, None)
    yield TestClient(app), users, rewards
    app.dependency_overrides.clear()


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_ten_syncs_leave_exactly_one_user_and_one_rewards_row(
    wired: tuple[TestClient, FakeUserRepo, FakeRewardsRepo], make_token: Callable[..., str]
) -> None:
    """The frontend calls this on every page load. REQ-001's storage criterion."""
    client, users, rewards = wired
    token = make_token(sub="user_2abc123", email="abc@student.monash.edu")

    for _ in range(10):
        response = client.post(SYNC_URL, headers=auth(token))
        assert response.status_code == 200

    assert len(users.rows) == 1
    assert len(rewards.user_ids) == 1


def test_every_sync_returns_the_same_user_id(
    wired: tuple[TestClient, FakeUserRepo, FakeRewardsRepo], make_token: Callable[..., str]
) -> None:
    """A new id each call would mean a new row each call, which the count
    assertion above could still miss if the fake overwrote by key."""
    client, _, _ = wired
    token = make_token(sub="user_2abc123")

    ids = {client.post(SYNC_URL, headers=auth(token)).json()["id"] for _ in range(3)}

    assert len(ids) == 1


def test_sync_without_a_token_is_401_and_writes_nothing(
    wired: tuple[TestClient, FakeUserRepo, FakeRewardsRepo],
) -> None:
    client, users, rewards = wired

    response = client.post(SYNC_URL)

    assert response.status_code == 401
    assert users.rows == {}
    assert rewards.user_ids == set()


def test_a_non_monash_address_is_403_and_writes_nothing(
    wired: tuple[TestClient, FakeUserRepo, FakeRewardsRepo], make_token: Callable[..., str]
) -> None:
    """Clerk's domain allowlist is a paid feature, so this check IS the
    restriction, not a backstop. MonashGuard on the frontend is UX only."""
    client, users, rewards = wired
    token = make_token(email="someone@gmail.com")

    response = client.post(SYNC_URL, headers=auth(token))

    assert response.status_code == 403
    assert users.rows == {}
    assert rewards.user_ids == set()


def test_a_renamed_clerk_account_updates_the_row_without_creating_a_second(
    wired: tuple[TestClient, FakeUserRepo, FakeRewardsRepo], make_token: Callable[..., str]
) -> None:
    """email and full_name are Clerk's to own; everything else is ours."""
    client, users, _ = wired
    client.post(SYNC_URL, headers=auth(make_token(full_name="Old Name")))

    response = client.post(SYNC_URL, headers=auth(make_token(full_name="New Name")))

    assert response.status_code == 200
    assert response.json()["full_name"] == "New Name"
    assert len(users.rows) == 1


def test_the_response_never_carries_clerk_id(
    wired: tuple[TestClient, FakeUserRepo, FakeRewardsRepo], make_token: Callable[..., str]
) -> None:
    """UserResponse omits it deliberately - the browser has no use for it and
    it is the join key for every other table."""
    client, _, _ = wired

    body = client.post(SYNC_URL, headers=auth(make_token())).json()

    assert "clerk_id" not in body
    assert body["email"] == "test@student.monash.edu"
