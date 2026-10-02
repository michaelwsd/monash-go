from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.schemas.enums import AccessoryCategory, PetStage


class Accessory(BaseModel):
    """A catalogue row."""

    id: UUID
    name: str
    description: str | None
    category: AccessoryCategory
    cost: int
    required_stage: PetStage
    image_url: str


class ShopItem(Accessory):
    """A catalogue row as one user sees it.

    Two separate reasons an item cannot be bought, and the shop shows them
    differently: `locked` is a pet that has not grown far enough, which no
    amount of points fixes, and affordability is a balance that will.
    """

    owned: bool
    equipped: bool
    locked: bool


class OwnedAccessory(BaseModel):
    accessory: Accessory
    equipped: bool
    purchased_at: datetime


class Pet(BaseModel):
    """GET /pet/me."""

    pet_stage: PetStage
    total_co2_saved: float
    green_points: int
    owned: list[OwnedAccessory]


class AccessoryPurchase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    accessory_id: UUID


class EquipUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    equipped: bool
