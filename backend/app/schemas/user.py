from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.schemas.enums import Campus, UserRole


class User(BaseModel):
    # a single user role used by services and repositories
    id: UUID
    clerk_id: str
    email: str
    phone: str
    full_name: str
    role: UserRole
    is_concession: bool
    home_campus: Campus | None
    green_points: int
    joined_at: datetime


class UserResponse(BaseModel):
    # what post /user/sync returns, clerk id stays internal
    id: UUID
    email: str
    phone: str
    full_name: str
    role: UserRole
    is_concession: bool
    home_campus: Campus | None
    green_points: int
    joined_at: datetime
