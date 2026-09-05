"""Every vehicles-table query."""

from typing import Any
from uuid import UUID

from app.schemas.enums import FuelType
from app.schemas.vehicle import Vehicle
from supabase import Client

TABLE = "vehicles"


def insert(
    db: Client,
    *,
    owner_id: UUID,
    make: str,
    model: str,
    year: int,
    fuel_type: FuelType,
    fuel_consumption: float,
) -> Vehicle:
    payload: dict[str, Any] = {
        "owner_id": str(owner_id),
        "make": make,
        "model": model,
        "year": year,
        "fuel_type": fuel_type,
        "fuel_consumption": fuel_consumption,
    }
    res = db.table(TABLE).insert(payload).execute()
    return Vehicle.model_validate(res.data[0])


def list_by_owner(db: Client, *, owner_id: UUID) -> list[Vehicle]:
    res = (
        db.table(TABLE)
        .select("*")
        .eq("owner_id", str(owner_id))
        .order("created_at", desc=True)
        .execute()
    )
    return [Vehicle.model_validate(row) for row in res.data]


def get_by_id(db: Client, vehicle_id: UUID) -> Vehicle | None:
    res = db.table(TABLE).select("*").eq("id", str(vehicle_id)).limit(1).execute()
    return Vehicle.model_validate(res.data[0]) if res.data else None
