from uuid import UUID

from fastapi import APIRouter

from app.api.deps import CurrentUser, SupabaseDep
from app.schemas.pet import AccessoryPurchase, EquipUpdate, Pet, ShopItem
from app.services import pet_service

router = APIRouter(prefix="/pet", tags=["pet"])


# Registered before /{...} routes would be, and before "accessories" could be
# read as anything else.
@router.get("/accessories", response_model=list[ShopItem])
def shop(clerk_id: CurrentUser, db: SupabaseDep) -> list[ShopItem]:
    return pet_service.shop(db, clerk_id=clerk_id)


@router.post("/accessories/buy", response_model=Pet, status_code=201)
def buy_accessory(payload: AccessoryPurchase, clerk_id: CurrentUser, db: SupabaseDep) -> Pet:
    return pet_service.buy(db, clerk_id=clerk_id, accessory_id=payload.accessory_id)


@router.put("/accessories/{accessory_id}/equip", response_model=Pet)
def equip_accessory(
    accessory_id: UUID, payload: EquipUpdate, clerk_id: CurrentUser, db: SupabaseDep
) -> Pet:
    return pet_service.equip(
        db, clerk_id=clerk_id, accessory_id=accessory_id, equipped=payload.equipped
    )


@router.get("/me", response_model=Pet)
def my_pet(clerk_id: CurrentUser, db: SupabaseDep) -> Pet:
    return pet_service.get_pet(db, clerk_id=clerk_id)
