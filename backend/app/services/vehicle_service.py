"""vehicle service: registration and look up"""

from collections.abc import Callable  # specifies function [[arg_types], return_type]
from uuid import UUID

from app.core.constants import MAX_CONSUMPTION_KWH_PER_100KM, MAX_CONSUMPTION_L_PER_100KM
from app.exceptions.errors import InvalidInputError, NotFoundError
from app.repositories import user_repository, vehicle_reference_repository, vehicle_repository
from app.schemas.enums import FuelType
from app.schemas.vehicle import Vehicle, VehicleCreate, VehicleReference, VehicleSuggestion
from supabase import Client

SUGGESTION_LIMIT = 10


def get_consumption_limit(fuel_type: FuelType) -> float:
    if fuel_type == "electric":
        return MAX_CONSUMPTION_KWH_PER_100KM
    return MAX_CONSUMPTION_L_PER_100KM


def get_owner_id(db: Client, clerk_id: str) -> UUID:
    owner = user_repository.get_by_clerk_id(db, clerk_id)
    if owner is None:
        raise NotFoundError("user not found")
    return owner.id


def register(db: Client, *, clerk_id: str, payload: VehicleCreate) -> Vehicle:
    """registers a car
    - driver picks a suggestion (in vehicle reference)
    - car was found by exact match
    """
    owner_id = get_owner_id(db, clerk_id)

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
        return vehicle_repository.insert(
            db,
            owner_id=owner_id,
            make=reference.make,
            model=reference.model,
            year=reference.year,
            fuel_type=reference.fuel_type,
            fuel_consumption=reference.avg_consumption,
        )

    # we are guaranteed these fields exist
    return vehicle_repository.insert(
        db,
        owner_id=owner_id,
        make=payload.make,
        model=payload.model,
        year=payload.year,
        fuel_type=payload.fuel_type,
        fuel_consumption=payload.fuel_consumption,
    )


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
    return vehicle_repository.list_by_owner(db, owner_id=get_owner_id(db, clerk_id=clerk_id))


def search_reference(
    db: Client, *, make: str, model: str | None = None, year: int | None = None
) -> list[VehicleReference]:
    """fuzzy search in the vehicle reference table"""
    return vehicle_reference_repository.search(db, make=make, model=model, year=year)
