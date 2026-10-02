from uuid import UUID

from fastapi import APIRouter

from app.api.deps import CurrentUser, MapsDep, SupabaseDep
from app.schemas.compare import Comparison, RouteEstimate
from app.schemas.enums import Campus
from app.services import compare_service

router = APIRouter(prefix="/compare", tags=["compare"])


# declared before /{ride_id}: path operations match in order, and the other
# way round "route" would be parsed as a ride_id and rejected as a bad UUID
@router.get("/route", response_model=RouteEstimate)
def estimate_route(
    origin: Campus, destination: Campus, clerk_id: CurrentUser, db: SupabaseDep, http: MapsDep
) -> RouteEstimate:
    return compare_service.estimate(
        db, http, clerk_id=clerk_id, origin=origin, destination=destination
    )


@router.get("/{ride_id}", response_model=Comparison)
def compare_ride(
    ride_id: UUID, clerk_id: CurrentUser, db: SupabaseDep, http: MapsDep
) -> Comparison:
    return compare_service.compare(db, http, clerk_id=clerk_id, ride_id=ride_id)
