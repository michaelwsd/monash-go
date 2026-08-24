from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, SupabaseDep
from app.schemas.enums import FuelType
from app.schemas.vehicle import (
    Vehicle,
    VehicleCreate,
    VehicleReference,
    VehicleResponse,
    VehicleSuggestion,
)
from app.services import vehicle_service

router = APIRouter(prefix="/vehicles", tags=["vehicles"])


@router.post("", response_model=VehicleResponse, status_code=201)
def register_vehicle(payload: VehicleCreate, clerk_id: CurrentUser, db: SupabaseDep) -> Vehicle:
    """register a vehicle for the user"""
    return vehicle_service.register(db, clerk_id=clerk_id, payload=payload)


@router.get("/me", response_model=list[VehicleResponse])
def get_my_vehicles(clerk_id: CurrentUser, db: SupabaseDep) -> list[Vehicle]:
    """get every vehicle registered by a user"""
    return vehicle_service.list_for_user(db, clerk_id=clerk_id)


@router.get("/reference", response_model=list[VehicleReference])
def search_reference(
    _: CurrentUser,
    db: SupabaseDep,
    make: Annotated[str, Query(min_length=1)],
    model: Annotated[str | None, Query()] = None,
    year: Annotated[int | None, Query(ge=1950, le=2100)] = None,
) -> list[VehicleReference]:
    """fuzzy search in the db"""
    return vehicle_service.search_reference(db, make=make, model=model, year=year)


@router.get("/reference/similar", response_model=list[VehicleSuggestion])
def suggest_reference(
    _: CurrentUser,
    db: SupabaseDep,
    make: Annotated[str, Query(min_length=1)],
    model: Annotated[str, Query(min_length=1)],
    year: Annotated[int, Query(ge=1950, le=2100)],
    fuel_type: FuelType,
) -> list[VehicleSuggestion]:
    """find close matches"""
    return vehicle_service.suggest(db, make=make, model=model, year=year, fuel_type=fuel_type)
