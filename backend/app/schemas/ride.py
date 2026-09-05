from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.enums import Campus, RideStatus
from app.schemas.vehicle import VehicleResponse


# a list of things the caller can decide
class RideCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    vehicle_id: UUID
    origin: Campus
    destination: Campus
    departure_at: datetime
    total_seats: int = Field(gt=0, le=7)

    # checks the field before the object is built, using the value passed in
    @field_validator("departure_at")
    @classmethod
    def must_be_aware(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("departure_at needs a timezone, e.g. 2026-09-10T09:00:00+10:00")
        return value

    @model_validator(mode="after")
    def check_distinct_campuses(self) -> "RideCreate":
        if self.origin == self.destination:
            raise ValueError("a ride needs two different campuses")
        return self


# what the repo returns
class Ride(BaseModel):
    id: UUID
    driver_id: UUID
    vehicle_id: UUID
    origin: Campus
    destination: Campus
    departure_at: datetime
    total_seats: int
    available_seats: int
    distance_km: float
    status: RideStatus
    co2_saved: float | None
    points_earned: int | None
    created_at: datetime


# what the api returns
class RideResponse(BaseModel):
    id: UUID
    driver_id: UUID
    vehicle_id: UUID
    origin: Campus
    destination: Campus
    departure_at: datetime
    total_seats: int
    available_seats: int
    distance_km: float
    status: RideStatus
    created_at: datetime


class RideDriver(BaseModel):
    """Just the name. Phone is revealed after a booking is confirmed."""

    id: UUID
    full_name: str


class RideDetail(RideResponse):
    driver: RideDriver
    vehicle: VehicleResponse
    route_summary: str | None
