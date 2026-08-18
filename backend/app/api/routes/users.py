from fastapi import APIRouter

from app.api.deps import CurrentClaims, SupabaseDep
from app.schemas.user import User, UserResponse
from app.services import user_service

router = APIRouter(prefix="/users", tags=["users"])


@router.post("/sync", response_model=UserResponse)
def sync_user(claims: CurrentClaims, db: SupabaseDep) -> User:
    return user_service.sync(
        db, clerk_id=claims.clerk_id, email=claims.email, full_name=claims.full_name
    )
