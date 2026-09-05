from fastapi import APIRouter

from app.api.deps import CurrentUser, MapsDep, SupabaseDep
from app.schemas.ride import Ride, RideCreate, RideResponse
from app.services import ride_service

router = APIRouter(prefix="/rides", tags=["rides"])


@router.post("", response_model=RideResponse, status_code=201)
def create_ride(payload: RideCreate, clerk_id: CurrentUser, db: SupabaseDep, http: MapsDep) -> Ride:
    return ride_service.create(db, http, clerk_id=clerk_id, payload=payload)
