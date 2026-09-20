from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, MapsDep, SupabaseDep
from app.schemas.enums import Campus
from app.schemas.ride import (
    Ride,
    RideCreate,
    RideDetail,
    RideDetailWithContact,
    RidePassenger,
    RideResponse,
)
from app.services import ride_service

router = APIRouter(prefix="/rides", tags=["rides"])


@router.post("", response_model=RideResponse, status_code=201)
def create_ride(payload: RideCreate, clerk_id: CurrentUser, db: SupabaseDep, http: MapsDep) -> Ride:
    return ride_service.create(db, http, clerk_id=clerk_id, payload=payload)


@router.get("/search", response_model=list[RideResponse])
def search_rides(
    _: CurrentUser,
    db: SupabaseDep,
    origin: Campus,
    destination: Campus,
    on: Annotated[date, Query(description="Melbourne calendar date")],
) -> list[Ride]:
    return ride_service.search(db, origin=origin, destination=destination, on=on)


# frontend selects a ride and calls this in backend
@router.get("/mine", response_model=list[RideResponse])
def my_rides(clerk_id: CurrentUser, db: SupabaseDep) -> list[Ride]:
    return ride_service.list_for_driver(db, clerk_id=clerk_id)


# response_model is deliberately unset. It would coerce whatever the service
# returns into one fixed shape, and coercing RideDetailWithContact down to
# RideDetail is exactly the bug this endpoint must not have. The service picks
# the model; FastAPI serialises the model it was handed.
@router.get("/{ride_id}", response_model=None)
def get_ride(
    clerk_id: CurrentUser, ride_id: UUID, db: SupabaseDep
) -> RideDetail | RideDetailWithContact:
    return ride_service.get_ride(db, clerk_id=clerk_id, ride_id=ride_id)


@router.get("/{ride_id}/passengers", response_model=list[RidePassenger])
def ride_passengers(clerk_id: CurrentUser, ride_id: UUID, db: SupabaseDep) -> list[RidePassenger]:
    return ride_service.list_passengers(db, clerk_id=clerk_id, ride_id=ride_id)
