import re
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator

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


class UserUpdate(BaseModel):
    # profile fields the user can update
    # email, full name and green points are absent (first two clerk, last one system)
    model_config = ConfigDict(extra="forbid")  # extra fields not allowed, prevent typo

    phone: str | None = None
    is_concession: bool | None = None
    home_campus: Campus | None = None

    @field_validator("phone")
    @classmethod
    def normalize_phone(cls, value: str | None) -> str | None:
        if value is None:
            return None
        digits = value.replace(" ", "")
        if not re.fullmatch(r"(\+?61|0)[2-478]\d{8}", digits):
            raise ValueError("must be an Australian phone number, e.g. 0412 345 678")
        return digits
