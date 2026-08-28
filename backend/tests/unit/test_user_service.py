"""User sync at the service layer. No database: the repositories are replaced
by in-memory fakes, so these tests assert on behaviour only."""

from datetime import UTC, datetime
from typing import cast
from uuid import UUID, uuid4

import pytest

from app.exceptions.errors import NotFoundError, PermissionDeniedError
from app.schemas.user import User, UserUpdate
from app.services import user_service
from supabase import Client

# sync takes a Client only to hand it to the repositories, and both are faked
# here, so nothing ever touches it. The cast is the type checker's cost of
# saying that.
NO_DB = cast(Client, None)


class FakeUserRepo:
    def __init__(self) -> None:
        self.rows: dict[str, User] = {}
        self.inserts = 0

    def get_by_clerk_id(self, db: object, clerk_id: str) -> User | None:
        return self.rows.get(clerk_id)

    def create_if_absent(
        self, db: object, *, clerk_id: str, email: str, full_name: str
    ) -> User | None:
        if clerk_id in self.rows:
            return None
        self.inserts += 1
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

    def update_profile(
        self, db: object, *, clerk_id: str, fields: dict[str, object]
    ) -> User | None:
        if clerk_id not in self.rows:
            return None
        updated = self.rows[clerk_id].model_copy(update=fields)
        self.rows[clerk_id] = updated
        return updated


class RecordingUserRepo(FakeUserRepo):
    """Same behaviour, but records which clerk_id each update was scoped to."""

    def __init__(self) -> None:
        super().__init__()
        self.update_calls: list[str] = []

    def update_profile(
        self, db: object, *, clerk_id: str, fields: dict[str, object]
    ) -> User | None:
        self.update_calls.append(clerk_id)
        return super().update_profile(db, clerk_id=clerk_id, fields=fields)


class FakeRewardsRepo:
    def __init__(self) -> None:
        self.user_ids: set[UUID] = set()

    def create_if_absent(self, db: object, *, user_id: UUID) -> None:
        self.user_ids.add(user_id)


@pytest.fixture
def repos(monkeypatch: pytest.MonkeyPatch) -> tuple[FakeUserRepo, FakeRewardsRepo]:
    users, rewards = FakeUserRepo(), FakeRewardsRepo()
    monkeypatch.setattr(user_service, "user_repository", users)
    monkeypatch.setattr(user_service, "rewards_repository", rewards)
    return users, rewards


def test_first_sync_creates_one_user_and_one_rewards_row(
    repos: tuple[FakeUserRepo, FakeRewardsRepo],
) -> None:
    users, rewards = repos

    result = user_service.sync(
        NO_DB, clerk_id="user_1", email="a@student.monash.edu", full_name="A B"
    )

    assert users.inserts == 1
    assert rewards.user_ids == {result.id}


def test_syncing_again_changes_nothing(
    repos: tuple[FakeUserRepo, FakeRewardsRepo],
) -> None:
    users, _ = repos
    kwargs = {"clerk_id": "user_1", "email": "a@student.monash.edu", "full_name": "A B"}

    first = user_service.sync(NO_DB, **kwargs)
    for _ in range(9):
        user_service.sync(NO_DB, **kwargs)

    assert users.inserts == 1
    assert len(users.rows) == 1
    assert users.rows["user_1"] == first


def test_partial_update_leaves_other_fields_alone(
    repos: tuple[FakeUserRepo, FakeRewardsRepo],
) -> None:
    users, _ = repos
    user_service.sync(NO_DB, clerk_id="user_1", email="a@student.monash.edu", full_name="A B")
    user_service.update_profile(NO_DB, clerk_id="user_1", changes=UserUpdate(phone="0412 345 678"))

    result = user_service.update_profile(
        NO_DB, clerk_id="user_1", changes=UserUpdate(is_concession=True)
    )

    assert result.is_concession is True
    assert result.phone == "0412345678"  # not blanked by the second call
    assert result.email == "a@student.monash.edu"


def test_profile_update_is_scoped_to_one_user(monkeypatch: pytest.MonkeyPatch) -> None:
    """The repository once shipped without .eq('clerk_id'), which made
    PATCH /users/me rewrite every row in the table. The fake filters, so the
    fake can never catch that on its own - what this pins is the contract the
    service relies on: the update is addressed to exactly one clerk_id."""
    users = RecordingUserRepo()
    monkeypatch.setattr(user_service, "user_repository", users)
    monkeypatch.setattr(user_service, "rewards_repository", FakeRewardsRepo())
    user_service.sync(NO_DB, clerk_id="user_1", email="a@student.monash.edu", full_name="A B")
    user_service.sync(NO_DB, clerk_id="user_2", email="b@student.monash.edu", full_name="C D")

    user_service.update_profile(NO_DB, clerk_id="user_1", changes=UserUpdate(home_campus="clayton"))

    assert users.update_calls == ["user_1"]
    assert users.rows["user_1"].home_campus == "clayton"
    assert users.rows["user_2"].home_campus is None  # the other row is untouched


def test_updating_an_unknown_user_is_not_found(
    repos: tuple[FakeUserRepo, FakeRewardsRepo],
) -> None:
    with pytest.raises(NotFoundError):
        user_service.update_profile(
            NO_DB, clerk_id="nobody", changes=UserUpdate(is_concession=True)
        )


def test_non_monash_email_is_rejected(
    repos: tuple[FakeUserRepo, FakeRewardsRepo],
) -> None:
    users, _ = repos

    with pytest.raises(PermissionDeniedError):
        user_service.sync(NO_DB, clerk_id="user_1", email="someone@gmail.com", full_name="A B")

    assert users.inserts == 0  # no row created for a rejected domain


def test_both_monash_domains_are_accepted(
    repos: tuple[FakeUserRepo, FakeRewardsRepo],
) -> None:
    user_service.sync(NO_DB, clerk_id="user_1", email="a@student.monash.edu", full_name="A B")
    user_service.sync(NO_DB, clerk_id="user_2", email="b@monash.edu", full_name="C D")

    assert repos[0].inserts == 2
