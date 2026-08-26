"""Vehicle and vehicle-reference queries."""

from collections.abc import Mapping
from typing import Any, cast
from uuid import UUID

from postgrest.exceptions import APIError

from app.exceptions.errors import ExternalServiceError
from app.schemas.vehicle import VehicleCreate, VehicleReference, VehicleResponse
from supabase import Client

VEHICLES_TABLE = "vehicles"


def _rows(data: object) -> list[Mapping[str, Any]]:
    return cast(list[Mapping[str, Any]], data or [])


def _execute(request: Any) -> Any:
    try:
        return request.execute()
    except APIError as exc:
        raise ExternalServiceError(
            "Vehicle data is unavailable. Check the backend Supabase URL and service-role key."
        ) from exc


def list_makes(db: Client) -> list[str]:
    res = _execute(db.rpc("vehicle_reference_makes"))
    return [str(row["make"]) for row in _rows(res.data)]


def list_models(db: Client, *, make: str) -> list[str]:
    res = _execute(db.rpc("vehicle_reference_models", {"p_make": make}))
    return [str(row["model"]) for row in _rows(res.data)]


def list_years(db: Client, *, make: str, model: str) -> list[int]:
    res = _execute(db.rpc("vehicle_reference_years", {"p_make": make, "p_model": model}))
    return [int(row["year"]) for row in _rows(res.data)]


def list_reference_options(
    db: Client, *, make: str, model: str, year: int
) -> list[VehicleReference]:
    res = _execute(
        db.rpc(
            "vehicle_reference_options",
            {"p_make": make, "p_model": model, "p_year": year},
        )
    )
    return [VehicleReference.model_validate(row) for row in _rows(res.data)]


def list_for_owner(db: Client, *, owner_id: UUID) -> list[VehicleResponse]:
    res = _execute(db.table(VEHICLES_TABLE).select("*").eq("owner_id", str(owner_id)))
    return [VehicleResponse.model_validate(row) for row in res.data]


def create(db: Client, *, owner_id: UUID, vehicle: VehicleCreate) -> VehicleResponse:
    payload = vehicle.model_dump()
    payload["owner_id"] = str(owner_id)
    res = _execute(db.table(VEHICLES_TABLE).insert(payload))
    return VehicleResponse.model_validate(res.data[0])
