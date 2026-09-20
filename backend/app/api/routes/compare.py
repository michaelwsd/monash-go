from uuid import UUID

from fastapi import APIRouter

from app.api.deps import CurrentUser, MapsDep, SupabaseDep
from app.schemas.compare import Comparison
from app.services import compare_service

router = APIRouter(prefix="/compare", tags=["compare"])


@router.get("/{ride_id}", response_model=Comparison)
def compare_ride(
    ride_id: UUID, clerk_id: CurrentUser, db: SupabaseDep, http: MapsDep
) -> Comparison:
    return compare_service.compare(db, http, clerk_id=clerk_id, ride_id=ride_id)
