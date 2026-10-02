"""The pet shop at the service layer.

The purchase itself is atomic in SQL (0005_buy_accessory.sql) for the same
reason booking is: two taps must not both pass one balance check. FakeShop
stands in for that function, and the tests here are about what the service does
with the word it returns - and about the one thing a shop must never do, which
is take points without handing over the item.
"""

from datetime import UTC, datetime
from typing import cast
from uuid import UUID, uuid4

import pytest

from app.core.points import pet_stage_for
from app.exceptions.errors import InsufficientPointsError, NotFoundError, StageLockedError
from app.schemas.pet import Accessory, OwnedAccessory
from app.schemas.rewards import Rewards
from app.schemas.user import User
from app.services import pet_service
from supabase import Client

DB = cast(Client, None)

USER = User(
    id=uuid4(),
    clerk_id="user_1",
    email="a@student.monash.edu",
    phone="0400000000",
    full_name="A B",
    role="passenger",
    is_concession=True,
    home_campus="clayton",
    green_points=1000,
    joined_at=datetime.now(UTC),
)

CHEAP = Accessory(
    id=uuid4(),
    name="Leaf cap",
    description=None,
    category="headwear",
    cost=400,
    required_stage="egg",
    image_url="/pet/leaf-cap.svg",
)
PRICEY = CHEAP.model_copy(update={"id": uuid4(), "name": "Solar halo", "cost": 6000})
LOCKED = CHEAP.model_copy(
    update={"id": uuid4(), "name": "Graduation cap", "cost": 100, "required_stage": "adult"}
)


class FakeUserRepo:
    def __init__(self, points: int) -> None:
        self.user = USER.model_copy(update={"green_points": points})

    def get_by_clerk_id(self, db: object, clerk_id: str) -> User | None:
        return self.user if clerk_id == USER.clerk_id else None


class FakeRewardsRepo:
    def __init__(self, total: float) -> None:
        self.total = total

    def get(self, db: object, *, user_id: UUID) -> Rewards:
        return Rewards(
            id=uuid4(), user_id=user_id, pet_stage="egg", total_co2_saved=self.total, milestone=0
        )


class FakeShop:
    """Stands in for buy_accessory(). Holds the balance and what is owned, and
    applies the same rules the SQL does - so a refusal here leaves the balance
    exactly as a refusal there would."""

    def __init__(self, users: FakeUserRepo, rewards: FakeRewardsRepo) -> None:
        self.users = users
        self.rewards = rewards
        self.owned: dict[UUID, bool] = {}
        self.catalogue = [CHEAP, PRICEY, LOCKED]

    def list_accessories(self, db: object) -> list[Accessory]:
        return sorted(self.catalogue, key=lambda a: a.cost)

    def list_owned(self, db: object, *, user_id: UUID) -> list[OwnedAccessory]:
        return [
            OwnedAccessory(
                accessory=next(a for a in self.catalogue if a.id == accessory_id),
                equipped=equipped,
                purchased_at=datetime.now(UTC),
            )
            for accessory_id, equipped in self.owned.items()
        ]

    def buy(self, db: object, *, user_id: UUID, accessory_id: UUID) -> tuple[str, int]:
        points = self.users.user.green_points
        item = next((a for a in self.catalogue if a.id == accessory_id), None)
        if item is None:
            return "accessory_not_found", points
        if accessory_id in self.owned:
            return "already_owned", points
        # the same comparison the SQL makes, spelled out rather than reaching
        # into the service's private helper
        stage = pet_stage_for(self.rewards.total)
        order = pet_service.STAGE_ORDER
        if order.index(stage) < order.index(item.required_stage):
            return "stage_locked", points
        if points < item.cost:
            return "insufficient_points", points
        self.users.user = self.users.user.model_copy(update={"green_points": points - item.cost})
        self.owned[accessory_id] = False
        return "bought", points - item.cost

    def set_equipped(
        self, db: object, *, user_id: UUID, accessory_id: UUID, equipped: bool
    ) -> bool:
        if accessory_id not in self.owned:
            return False
        self.owned[accessory_id] = equipped
        return True


def install(
    monkeypatch: pytest.MonkeyPatch, *, points: int = 1000, total: float = 0.0
) -> tuple[FakeShop, FakeUserRepo]:
    users = FakeUserRepo(points)
    rewards = FakeRewardsRepo(total)
    shop = FakeShop(users, rewards)
    monkeypatch.setattr(pet_service, "user_repository", users)
    monkeypatch.setattr(pet_service, "rewards_repository", rewards)
    monkeypatch.setattr(pet_service, "pet_repository", shop)
    return shop, users


# --- buying --------------------------------------------------------------


def test_buying_deducts_and_the_item_is_owned(monkeypatch: pytest.MonkeyPatch) -> None:
    shop, users = install(monkeypatch, points=1000)

    pet = pet_service.buy(DB, clerk_id=USER.clerk_id, accessory_id=CHEAP.id)

    assert users.user.green_points == 600
    assert [o.accessory.id for o in pet.owned] == [CHEAP.id]
    assert pet.green_points == 600


def test_a_failed_purchase_leaves_the_balance_untouched(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The one thing a shop must never do. Asserted as a before/after balance,
    not merely as "the call raised" - an exception after a deduction would
    still have taken the points."""
    shop, users = install(monkeypatch, points=100)
    before = users.user.green_points

    with pytest.raises(InsufficientPointsError):
        pet_service.buy(DB, clerk_id=USER.clerk_id, accessory_id=PRICEY.id)

    assert users.user.green_points == before
    assert shop.owned == {}


def test_an_item_above_the_pets_stage_is_locked(monkeypatch: pytest.MonkeyPatch) -> None:
    """Locked is not the same as unaffordable: this one costs 100 and the user
    has 1,000. Points cannot buy growth."""
    shop, users = install(monkeypatch, points=1000, total=0.0)

    with pytest.raises(StageLockedError):
        pet_service.buy(DB, clerk_id=USER.clerk_id, accessory_id=LOCKED.id)

    assert users.user.green_points == 1000
    assert shop.owned == {}


def test_a_grown_pet_unlocks_the_item(monkeypatch: pytest.MonkeyPatch) -> None:
    """200 kg is the 'adult' threshold from core/constants.py."""
    _, users = install(monkeypatch, points=1000, total=200.0)

    pet_service.buy(DB, clerk_id=USER.clerk_id, accessory_id=LOCKED.id)

    assert users.user.green_points == 900


def test_buying_the_same_item_twice_is_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    _, users = install(monkeypatch, points=1000)
    pet_service.buy(DB, clerk_id=USER.clerk_id, accessory_id=CHEAP.id)

    with pytest.raises(Exception):  # noqa: B017 - the type is the service's choice
        pet_service.buy(DB, clerk_id=USER.clerk_id, accessory_id=CHEAP.id)

    assert users.user.green_points == 600  # charged once


def test_an_accessory_that_does_not_exist_is_a_not_found(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    install(monkeypatch)

    with pytest.raises(NotFoundError):
        pet_service.buy(DB, clerk_id=USER.clerk_id, accessory_id=uuid4())


# --- equipping -----------------------------------------------------------


def test_equipping_changes_nothing_but_the_flag(monkeypatch: pytest.MonkeyPatch) -> None:
    """Taking a hat off is not a refund."""
    _, users = install(monkeypatch, points=1000)
    pet_service.buy(DB, clerk_id=USER.clerk_id, accessory_id=CHEAP.id)

    on = pet_service.equip(DB, clerk_id=USER.clerk_id, accessory_id=CHEAP.id, equipped=True)
    assert on.owned[0].equipped is True
    assert users.user.green_points == 600

    off = pet_service.equip(DB, clerk_id=USER.clerk_id, accessory_id=CHEAP.id, equipped=False)
    assert off.owned[0].equipped is False
    assert [o.accessory.id for o in off.owned] == [CHEAP.id]
    assert users.user.green_points == 600


def test_equipping_something_you_do_not_own_is_a_not_found(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    install(monkeypatch)

    with pytest.raises(NotFoundError):
        pet_service.equip(DB, clerk_id=USER.clerk_id, accessory_id=CHEAP.id, equipped=True)


# --- the shop listing ----------------------------------------------------


def test_the_shop_separates_locked_from_unaffordable(monkeypatch: pytest.MonkeyPatch) -> None:
    """Two different reasons an item cannot be bought, and the screen shows
    them differently: one is fixed by saving, the other only by riding."""
    install(monkeypatch, points=100, total=0.0)

    items = {item.name: item for item in pet_service.shop(DB, clerk_id=USER.clerk_id)}

    assert items["Graduation cap"].locked is True  # stage, not money
    assert items["Solar halo"].locked is False  # just expensive
    assert items["Leaf cap"].locked is False


def test_the_shop_marks_what_is_owned_and_worn(monkeypatch: pytest.MonkeyPatch) -> None:
    install(monkeypatch, points=1000)
    pet_service.buy(DB, clerk_id=USER.clerk_id, accessory_id=CHEAP.id)
    pet_service.equip(DB, clerk_id=USER.clerk_id, accessory_id=CHEAP.id, equipped=True)

    items = {item.name: item for item in pet_service.shop(DB, clerk_id=USER.clerk_id)}

    assert items["Leaf cap"].owned is True
    assert items["Leaf cap"].equipped is True
    assert items["Solar halo"].owned is False


def test_the_shop_is_cheapest_first(monkeypatch: pytest.MonkeyPatch) -> None:
    install(monkeypatch)

    costs = [item.cost for item in pet_service.shop(DB, clerk_id=USER.clerk_id)]

    assert costs == sorted(costs)
