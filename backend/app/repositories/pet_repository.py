"""Every accessories and pet_accessories query."""

from typing import Any
from uuid import UUID

from pydantic import TypeAdapter

from app.schemas.pet import Accessory, OwnedAccessory
from supabase import Client

ACCESSORIES = "accessories"
OWNED = "pet_accessories"

PURCHASE_ROWS = TypeAdapter(list[dict[str, object]])
# The joined shape PostgREST returns for an owned accessory. Validating it is
# what turns untyped JSON into something indexable.
OWNED_ROWS = TypeAdapter(list[dict[str, Any]])


def list_accessories(db: Client) -> list[Accessory]:
    """The whole catalogue, cheapest first - the order the shop reads in."""
    res = db.table(ACCESSORIES).select("*").order("cost").execute()
    return [Accessory.model_validate(row) for row in res.data]


def list_owned(db: Client, *, user_id: UUID) -> list[OwnedAccessory]:
    """What this user owns, with the catalogue row joined in.

    PostgREST follows the foreign key when the related table is named in the
    select, so this is one request rather than one per item.
    """
    res = (
        db.table(OWNED)
        .select("equipped,purchased_at,accessories(*)")
        .eq("user_id", str(user_id))
        .order("purchased_at")
        .execute()
    )
    rows = OWNED_ROWS.validate_python(res.data)
    return [
        OwnedAccessory(
            accessory=Accessory.model_validate(row["accessories"]),
            equipped=row["equipped"],
            purchased_at=row["purchased_at"],
        )
        for row in rows
    ]


def buy(db: Client, *, user_id: UUID, accessory_id: UUID) -> tuple[str, int]:
    """Deduct and insert in one transaction. Returns the word and the new balance."""
    res = db.rpc(
        "buy_accessory",
        {"p_user_id": str(user_id), "p_accessory_id": str(accessory_id)},
    ).execute()
    row = PURCHASE_ROWS.validate_python(res.data)[0]
    return str(row["result"]), int(row["balance"])  # type: ignore[call-overload]


def set_equipped(db: Client, *, user_id: UUID, accessory_id: UUID, equipped: bool) -> bool:
    """Toggle one owned accessory. False if the user does not own it."""
    res = (
        db.table(OWNED)
        .update({"equipped": equipped})
        .eq("user_id", str(user_id))
        .eq("accessory_id", str(accessory_id))
        .execute()
    )
    return bool(res.data)
