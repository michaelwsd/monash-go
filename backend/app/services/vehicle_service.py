"""Business rules for registering vehicles owned by the current user."""

from app.exceptions.errors import NotFoundError
from app.repositories import user_repository, vehicle_repository
from app.schemas.user import User
from app.schemas.vehicle import VehicleCreate, VehicleReference, VehicleResponse
from supabase import Client

DEMO_CLERK_ID = "dev-vehicle-user"
DEMO_EMAIL = "dev.vehicle@student.monash.edu"
DEMO_NAME = "Vehicle Demo User"


def list_makes(db: Client) -> list[str]:
    return vehicle_repository.list_makes(db)


def list_models(db: Client, *, make: str) -> list[str]:
    return vehicle_repository.list_models(db, make=make)


def list_years(db: Client, *, make: str, model: str) -> list[int]:
    return vehicle_repository.list_years(db, make=make, model=model)


def list_reference_options(
    db: Client, *, make: str, model: str, year: int
) -> list[VehicleReference]:
    return vehicle_repository.list_reference_options(db, make=make, model=model, year=year)


def list_my_vehicles(db: Client, *, clerk_id: str) -> list[VehicleResponse]:
    owner = _get_vehicle_owner(db, clerk_id=clerk_id)
    if not owner:
        raise NotFoundError("user not found; sync the account before registering a vehicle")
    return vehicle_repository.list_for_owner(db, owner_id=owner.id)


def register(db: Client, *, clerk_id: str, vehicle: VehicleCreate) -> VehicleResponse:
    owner = _get_vehicle_owner(db, clerk_id=clerk_id)
    if not owner:
        raise NotFoundError("user not found; sync the account before registering a vehicle")
    return vehicle_repository.create(db, owner_id=owner.id, vehicle=vehicle)


def _get_vehicle_owner(db: Client, *, clerk_id: str) -> User | None:
    owner = user_repository.get_by_clerk_id(db, clerk_id)
    if owner or clerk_id != DEMO_CLERK_ID:
        return owner
    return user_repository.create_if_absent(
        db,
        clerk_id=DEMO_CLERK_ID,
        email=DEMO_EMAIL,
        full_name=DEMO_NAME,
    ) or user_repository.get_by_clerk_id(db, DEMO_CLERK_ID)
