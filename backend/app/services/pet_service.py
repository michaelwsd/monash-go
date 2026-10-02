"""The pet and its shop.

Points are currency, so buying has the same shape as booking a seat: a balance
is read, a decision is made, a write follows. Two taps on Buy would both read
the same balance and both pass the check, so the read-decide-write happens
inside supabase/migrations/0005_buy_accessory.sql under a row lock, and this
file translates the word it returns.
"""

import logging
from uuid import UUID

from app.core.points import pet_stage_for
from app.exceptions.errors import (
    DomainError,
    InsufficientPointsError,
    NotFoundError,
    StageLockedError,
)
from app.repositories import pet_repository, rewards_repository, user_repository
from app.schemas.enums import PetStage
from app.schemas.pet import OwnedAccessory, Pet, ShopItem
from supabase import Client

log = logging.getLogger(__name__)

PURCHASE_ERRORS: dict[str, type[DomainError]] = {
    "accessory_not_found": NotFoundError,
    "already_owned": DomainError,
    "stage_locked": StageLockedError,
    "insufficient_points": InsufficientPointsError,
}

# The stages in order, so "has this pet grown far enough?" is one comparison.
STAGE_ORDER: tuple[PetStage, ...] = ("egg", "hatched", "juvenile", "adult", "legendary")


def _reached(stage: PetStage, required: PetStage) -> bool:
    return STAGE_ORDER.index(stage) >= STAGE_ORDER.index(required)


def get_pet(db: Client, *, clerk_id: str) -> Pet:
    user = user_repository.get_by_clerk_id(db, clerk_id)
    if not user:
        raise NotFoundError("user not found")

    rewards = rewards_repository.get(db, user_id=user.id)
    total = rewards.total_co2_saved if rewards else 0.0
    return Pet(
        # Derived from the total rather than read from the column: the two
        # agree, and deriving means a threshold change takes effect without a
        # backfill.
        pet_stage=pet_stage_for(total),
        total_co2_saved=total,
        green_points=user.green_points,
        owned=pet_repository.list_owned(db, user_id=user.id),
    )


def shop(db: Client, *, clerk_id: str) -> list[ShopItem]:
    """The catalogue, annotated for this user.

    `locked` and affordability are deliberately separate: a locked item is a
    pet that has not grown far enough, which no amount of points fixes, and the
    shop shows the two differently.
    """
    user = user_repository.get_by_clerk_id(db, clerk_id)
    if not user:
        raise NotFoundError("user not found")

    rewards = rewards_repository.get(db, user_id=user.id)
    stage = pet_stage_for(rewards.total_co2_saved if rewards else 0.0)
    owned = {item.accessory.id: item for item in pet_repository.list_owned(db, user_id=user.id)}

    return [
        ShopItem(
            **accessory.model_dump(),
            owned=accessory.id in owned,
            equipped=owned[accessory.id].equipped if accessory.id in owned else False,
            locked=not _reached(stage, accessory.required_stage),
        )
        for accessory in pet_repository.list_accessories(db)
    ]


def buy(db: Client, *, clerk_id: str, accessory_id: UUID) -> Pet:
    user = user_repository.get_by_clerk_id(db, clerk_id)
    if not user:
        raise NotFoundError("user not found")

    result, balance = pet_repository.buy(db, user_id=user.id, accessory_id=accessory_id)
    if result != "bought":
        raise PURCHASE_ERRORS.get(result, DomainError)(f"could not buy: {result}")

    log.info("user %s bought accessory %s, balance now %d", user.id, accessory_id, balance)
    return get_pet(db, clerk_id=clerk_id)


def equip(db: Client, *, clerk_id: str, accessory_id: UUID, equipped: bool) -> Pet:
    """Put an accessory on the pet, or take it off.

    Ownership and balance are untouched - taking a hat off is not a refund.
    """
    user = user_repository.get_by_clerk_id(db, clerk_id)
    if not user:
        raise NotFoundError("user not found")

    if not pet_repository.set_equipped(
        db, user_id=user.id, accessory_id=accessory_id, equipped=equipped
    ):
        raise NotFoundError("you do not own that accessory")

    return get_pet(db, clerk_id=clerk_id)


def owned_accessories(db: Client, *, clerk_id: str) -> list[OwnedAccessory]:
    return get_pet(db, clerk_id=clerk_id).owned
