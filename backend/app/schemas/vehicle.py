from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.enums import FuelType


class VehicleCreate(BaseModel):
    """request body for POST /vehicles"""

    model_config = ConfigDict(extra="forbid")

    make: str = Field(min_length=1, max_length=60)
    model: str = Field(min_length=1, max_length=60)
    year: int = Field(ge=1950, le=2100)
    fuel_type: FuelType
    fuel_consumption: float = Field(gt=0)
    # set when the driver picks a suggestion; the reference row then wins
    # for every field and fuel_consumption above is ignored
    reference_id: int | None = None


class Vehicle(BaseModel):
    """a single vehicle row"""

    id: UUID
    owner_id: UUID
    make: str
    model: str
    year: int
    fuel_type: FuelType
    fuel_consumption: float
    created_at: datetime


class VehicleResponse(BaseModel):
    """vehicle return type"""

    id: UUID
    make: str
    model: str
    year: int
    fuel_type: FuelType
    fuel_consumption: float
    created_at: datetime


class VehicleReference(BaseModel):
    """
    a vehicle reference row, read-only lookup data
    no uuid as it's only for lookup
    avg_consumption: kWh/100km for electric, L/100km otherwise
    """

    id: int
    make: str
    model: str
    year: int
    fuel_type: FuelType
    engine_size: float | None
    avg_consumption: float


class VehicleSuggestion(BaseModel):
    """find the closest match when a vehicle is not in the db"""

    reference: VehicleReference
    match_reason: str
