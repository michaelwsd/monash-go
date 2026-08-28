"""vehicle service: registration and look up"""

from collections.abc import Callable  # specifies function [[arg_types], return_type]

from app.core.constants import MAX_CONSUMPTION_KWH_PER_100KM, MAX_CONSUMPTION_L_PER_100KM
from app.exceptions.errors import InvalidInputError, NotFoundError
from app.repositories import user_repository, vehicle_reference_repository, vehicle_repository
from app.schemas.enums import FuelType
from app.schemas.user import User
from app.schemas.vehicle import Vehicle, VehicleCreate, VehicleReference, VehicleSuggestion
from supabase import Client

SUGGESTION_LIMIT = 10


def get_consumption_limit(fuel_type: FuelType) -> float:
    if fuel_type == "electric":
        return MAX_CONSUMPTION_KWH_PER_100KM
    return MAX_CONSUMPTION_L_PER_100KM


def get_owner(db: Client, clerk_id: str) -> User:
    owner = user_repository.get_by_clerk_id(db, clerk_id)
    if owner is None:
        raise NotFoundError("user not found")
    return owner


def promote_to_driver(db: Client, owner: User) -> None:
    """Registering a vehicle is what makes someone a driver.

    Every user starts as 'passenger' - it is the column default, so it means
    "hasn't done anything yet" rather than "has booked a seat". Owning a car
    is the first unambiguous signal, and from Sprint 3 it is load-bearing:
    POST /rides has nobody to accept without it.

    Only 'passenger' is promoted. 'driver' is already correct and 'both' would
    be a demotion. Sprint 4 owns the other direction - a driver who books a
    seat becomes 'both' - so each sprint sets exactly one transition and this
    stays idempotent across repeat registrations.
    """
    if owner.role == "passenger":
        user_repository.set_role(db, clerk_id=owner.clerk_id, role="driver")


def register(db: Client, *, clerk_id: str, payload: VehicleCreate) -> Vehicle:
    """registers a car
    - driver picks a suggestion (in vehicle reference)
    - car was found by exact match
    """
    owner = get_owner(db, clerk_id)

    # driver picked a suggestion we gave
    if payload.reference_id is not None:
        reference = vehicle_reference_repository.get_by_id(db, payload.reference_id)
        if reference is None:
            raise NotFoundError("referenced vehicle not found")

    # they typed it by hand and we found an exact match
    else:
        limit = get_consumption_limit(payload.fuel_type)
        if payload.fuel_consumption > limit:
            unit = "kWh/100km" if payload.fuel_type == "electric" else "L/100km"
            raise InvalidInputError(f"fuel consumption must be between 0 and {limit} {unit}")
        reference = vehicle_reference_repository.find_match(
            db,
            make=payload.make,
            model=payload.model,
            year=payload.year,
            fuel_type=payload.fuel_type,
        )

    if reference is not None:
        vehicle = vehicle_repository.insert(
            db,
            owner_id=owner.id,
            make=reference.make,
            model=reference.model,
            year=reference.year,
            fuel_type=reference.fuel_type,
            fuel_consumption=reference.avg_consumption,
        )
    else:
        # we are guaranteed these fields exist
        vehicle = vehicle_repository.insert(
            db,
            owner_id=owner.id,
            make=payload.make,
            model=payload.model,
            year=payload.year,
            fuel_type=payload.fuel_type,
            fuel_consumption=payload.fuel_consumption,
        )

    # after the insert: a failed registration must not leave a driver with no car
    promote_to_driver(db, owner)
    return vehicle


def suggest(
    db: Client, *, make: str, model: str, year: int, fuel_type: FuelType
) -> list[VehicleSuggestion]:
    """
    near matches for a car the exact lookup didn't find, relax and find closest matches
    """
    # a list of relaxation functions
    tiers: list[tuple[str, Callable[[], list[VehicleReference]]]] = [
        (
            "same model, different year",
            lambda: vehicle_reference_repository.same_model_any_year(db, make=make, model=model),
        ),
        (
            "similar model, same fuel type",
            lambda: vehicle_reference_repository.similar_model(
                db, make=make, model=model, fuel_type=fuel_type
            ),
        ),
        (
            "same make and fuel type",
            lambda: vehicle_reference_repository.same_make_and_fuel(
                db, make=make, fuel_type=fuel_type
            ),
        ),
    ]

    for reason, fn in tiers:
        # run the function to see close matches
        rows = fn()
        if rows:
            # closest year
            closest = sorted(rows, key=lambda row: abs(row.year - year))
            return [
                VehicleSuggestion(reference=row, match_reason=reason)
                for row in closest[:SUGGESTION_LIMIT]
            ]

    return []


def list_for_user(db: Client, *, clerk_id: str) -> list[Vehicle]:
    """list all vehicles for a user"""
    return vehicle_repository.list_by_owner(db, owner_id=get_owner(db, clerk_id).id)


def search_reference(
    db: Client, *, make: str, model: str | None = None, year: int | None = None
) -> list[VehicleReference]:
    """fuzzy search in the vehicle reference table"""
    return vehicle_reference_repository.search(db, make=make, model=model, year=year)
