from datetime import UTC, datetime

import httpx

from app.exceptions.errors import InvalidInputError, NotFoundError, PermissionDeniedError
from app.repositories import ride_repository, user_repository, vehicle_repository
from app.schemas.ride import Ride, RideCreate
from app.services import route_service
from supabase import Client


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
