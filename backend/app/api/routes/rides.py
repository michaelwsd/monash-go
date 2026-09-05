from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, MapsDep, SupabaseDep
from app.schemas.enums import Campus
from app.schemas.ride import Ride, RideCreate, RideDetail, RideResponse
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
@router.get("/{ride_id}", response_model=RideDetail)
def get_ride(_: CurrentUser, ride_id: UUID, db: SupabaseDep) -> RideDetail:
    return ride_service.get_ride(db, ride_id=ride_id)
