from fastapi import APIRouter

from app.api.deps import CurrentClaims, CurrentUser, SupabaseDep
from app.schemas.user import User, UserResponse, UserUpdate
from app.services import user_service

router = APIRouter(prefix="/users", tags=["users"])


@router.post("/sync", response_model=UserResponse)
def sync_user(claims: CurrentClaims, db: SupabaseDep) -> User:
    return user_service.sync(
        db, clerk_id=claims.clerk_id, email=claims.email, full_name=claims.full_name
    )


@router.patch("/me", response_model=UserResponse)
def update_me(changes: UserUpdate, user_clerk_id: CurrentUser, db: SupabaseDep) -> User:
    """update the caller's profile"""
    return user_service.update_profile(db, clerk_id=user_clerk_id, changes=changes)
