from app.schemas.enums import FuelType
from app.schemas.fuel import FuelPrice
from supabase import Client

TABLE = "fuel_prices"


def insert(db: Client, *, fuel_type: FuelType, price_per_litre: float) -> FuelPrice:
    payload = {"fuel_type": fuel_type, "price_per_litre": price_per_litre}

    res = db.table(TABLE).insert(payload).execute()
    return FuelPrice.model_validate(res.data[0])


def latest(db: Client, *, fuel_type: FuelType) -> FuelPrice | None:
    res = (
        db.table(TABLE)
        .select("*")
        .eq("fuel_type", fuel_type)
        .order("fetched_at", desc=True)
        .limit(1)
        .execute()
    )
    return FuelPrice.model_validate(res.data[0]) if res.data else None
