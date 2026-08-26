from fastapi import APIRouter, Query

from app.api.deps import SupabaseDep, VehicleUser
from app.schemas.vehicle import VehicleCreate, VehicleReference, VehicleResponse
from app.services import vehicle_service

router = APIRouter(prefix="/vehicles", tags=["vehicles"])


@router.get("/reference/makes", response_model=list[str])
def reference_makes(_: VehicleUser, db: SupabaseDep) -> list[str]:
    return vehicle_service.list_makes(db)


@router.get("/reference/models", response_model=list[str])
def reference_models(_: VehicleUser, db: SupabaseDep, make: str = Query(min_length=1)) -> list[str]:
    return vehicle_service.list_models(db, make=make)


@router.get("/reference/years", response_model=list[int])
def reference_years(
    _: VehicleUser,
    db: SupabaseDep,
    make: str = Query(min_length=1),
    model: str = Query(min_length=1),
) -> list[int]:
    return vehicle_service.list_years(db, make=make, model=model)


@router.get("/reference", response_model=list[VehicleReference])
def reference_options(
    _: VehicleUser,
    db: SupabaseDep,
    make: str = Query(min_length=1),
    model: str = Query(min_length=1),
    year: int = Query(ge=1950, le=2100),
) -> list[VehicleReference]:
    return vehicle_service.list_reference_options(db, make=make, model=model, year=year)


@router.get("/me", response_model=list[VehicleResponse])
def my_vehicles(user_clerk_id: VehicleUser, db: SupabaseDep) -> list[VehicleResponse]:
    return vehicle_service.list_my_vehicles(db, clerk_id=user_clerk_id)


@router.post("", response_model=VehicleResponse, status_code=201)
def register_vehicle(
    vehicle: VehicleCreate, user_clerk_id: VehicleUser, db: SupabaseDep
) -> VehicleResponse:
    return vehicle_service.register(db, clerk_id=user_clerk_id, vehicle=vehicle)
