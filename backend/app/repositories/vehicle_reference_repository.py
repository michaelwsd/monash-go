from typing import Any

from app.schemas.enums import FuelType
from app.schemas.vehicle import VehicleReference
from supabase import Client

TABLE = "vehicle_reference"
SEARCH_LIMIT = 20
RELAXED_LIMIT = 60


def rows(res_data: list[Any]) -> list[VehicleReference]:
    return [VehicleReference.model_validate(row) for row in res_data]


def get_by_id(db: Client, reference_id: int) -> VehicleReference | None:
    res = db.table(TABLE).select("*").eq("id", reference_id).limit(1).execute()
    return VehicleReference.model_validate(res.data[0]) if res.data else None


def find_match(
    db: Client, *, make: str, model: str, year: int, fuel_type: FuelType
) -> VehicleReference | None:
    """try to find an exact match"""
    res = (
        db.table(TABLE)
        .select("*")
        .ilike("make", make)
        .ilike("model", model)
        .eq("year", year)
        .eq("fuel_type", fuel_type)
        .limit(1)
        .execute()
    )
    return VehicleReference.model_validate(res.data[0]) if res.data else None


def search(
    db: Client, *, make: str | None = None, model: str | None = None, year: int | None = None
) -> list[VehicleReference]:
    # typeahead/auto suggestion for the picker using case insensitive partial match
    query = db.table(TABLE).select("*").ilike("make", f"%{make}%")
    if model is not None:
        query = query.ilike("model", f"%{model}%")
    if year is not None:
        query = query.eq("year", year)
    return rows(query.order("year", desc=True).limit(SEARCH_LIMIT).execute().data)


# using three relaxation tiers to do closest search


def same_model_any_year(db: Client, *, make: str, model: str) -> list[VehicleReference]:
    res = (
        db.table(TABLE)
        .select("*")
        .ilike("make", make)
        .ilike("model", model)
        .limit(RELAXED_LIMIT)
        .execute()
    )
    return rows(res.data)


def similar_model(
    db: Client, *, make: str, model: str, fuel_type: FuelType
) -> list[VehicleReference]:
    res = (
        db.table(TABLE)
        .select("*")
        .ilike("make", make)
        .ilike("model", f"%{model}%")
        .eq("fuel_type", fuel_type)
        .limit(RELAXED_LIMIT)
        .execute()
    )
    return rows(res.data)


def same_make_and_fuel(db: Client, *, make: str, fuel_type: FuelType) -> list[VehicleReference]:
    res = (
        db.table(TABLE)
        .select("*")
        .ilike("make", make)
        .eq("fuel_type", fuel_type)
        .limit(RELAXED_LIMIT)
        .execute()
    )
    return rows(res.data)
