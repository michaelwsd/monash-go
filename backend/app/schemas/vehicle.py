from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.enums import FuelType


class VehicleReference(BaseModel):
    """A catalogue option used to prefill a vehicle's efficiency."""

    id: int
    make: str
    model: str
    year: int
    fuel_type: FuelType
    engine_size: float | None
    avg_consumption: float


class VehicleCreate(BaseModel):
    """The efficiency is copied into the vehicle so historic rides stay accurate."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    make: str = Field(min_length=1, max_length=80)
    model: str = Field(min_length=1, max_length=120)
    year: int = Field(ge=1950, le=2100)
    fuel_type: FuelType
    fuel_consumption: float = Field(gt=0, le=100)


class VehicleResponse(VehicleCreate):
    id: UUID
    owner_id: UUID
    created_at: datetime
