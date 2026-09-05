from datetime import UTC, date, datetime, time, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

import httpx

from app.exceptions.errors import InvalidInputError, NotFoundError, PermissionDeniedError
from app.repositories import ride_repository, route_repository, user_repository, vehicle_repository
from app.schemas.enums import Campus
from app.schemas.ride import Ride, RideCreate, RideDetail, RideDriver
from app.schemas.vehicle import VehicleResponse
from app.services import route_service
from supabase import Client

MELBOURNE = ZoneInfo("Australia/Melbourne")


def create(db: Client, http: httpx.Client, *, clerk_id: str, payload: RideCreate) -> Ride:
    owner = user_repository.get_by_clerk_id(db, clerk_id)
    if not owner:
        raise NotFoundError("user not found")

    vehicle = vehicle_repository.get_by_id(db, payload.vehicle_id)
    if not vehicle:
        raise NotFoundError("vehicle not found")

    if vehicle.owner_id != owner.id:
        raise PermissionDeniedError("this vehicle belongs to someone else")

    if payload.departure_at <= datetime.now(UTC):
        raise InvalidInputError("departure time must be in the future")

    route = route_service.get_route(
        db, http, origin=payload.origin, destination=payload.destination, travel_mode="drive"
    )

    if route.distance_km is None:
        raise NotFoundError(
            f"no drive distance cached for {payload.origin} to {payload.destination}"
        )

    return ride_repository.insert(
        db,
        driver_id=owner.id,
        vehicle_id=vehicle.id,
        origin=payload.origin,
        destination=payload.destination,
        departure_at=payload.departure_at,
        total_seats=payload.total_seats,
        available_seats=payload.total_seats,
        distance_km=route.distance_km,
    )


def search(db: Client, *, origin: Campus, destination: Campus, on: date) -> list[Ride]:
    if origin == destination:
        raise InvalidInputError("a ride needs two different campuses")
    window_start = datetime.combine(on, time.min, tzinfo=MELBOURNE)
    window_end = window_start + timedelta(days=1)
    return ride_repository.search(
        db, origin=origin, destination=destination, window_start=window_start, window_end=window_end
    )


def get_ride(db: Client, *, ride_id: UUID) -> RideDetail:
    ride = ride_repository.get_ride(db, ride_id)
    if not ride:
        raise NotFoundError("ride not found")

    owner = user_repository.get_by_id(db, ride.driver_id)
    vehicle = vehicle_repository.get_by_id(db, ride.vehicle_id)

    if owner is None or vehicle is None:
        raise NotFoundError("ride is missing owner or vehicle")

    route = route_repository.get(
        db, origin=ride.origin, destination=ride.destination, travel_mode="drive"
    )

    return RideDetail(
        **ride.model_dump(),
        driver=RideDriver(id=owner.id, full_name=owner.full_name),
        vehicle=VehicleResponse(**vehicle.model_dump()),
        route_summary=route.route_summary if route else None,
    )
