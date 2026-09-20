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
    """A driver as a stranger sees them: a name, and nothing to contact them by.

    There is no phone field. That is the point - the rule is enforced by the
    shape of the model rather than by remembering to delete a key, so no future
    edit to User can leak a number into a response that should not carry one.
    """

    id: UUID
    full_name: str


class RideDriverContact(RideDriver):
    """A driver as someone with a confirmed seat sees them.

    CLAUDE.md: phone numbers are only revealed after a booking is confirmed.
    Before that, a driver's number would be readable by anyone who can search.
    """

    phone: str


class RideDetail(RideResponse):
    driver: RideDriver
    vehicle: VehicleResponse
    route_summary: str | None


class RideDetailWithContact(RideDetail):
    """The same ride, for a passenger who has booked it.

    Only the driver field differs. Narrowing it in a subclass keeps the other
    fourteen in one place, so the two responses cannot drift apart.
    """

    driver: RideDriverContact


class RidePassenger(BaseModel):
    """A confirmed passenger, as the ride's driver sees them.

    The mirror of RideDriverContact: a booking is the thing that reveals a
    number in either direction. Only the driver is ever handed this model -
    the route refuses anyone else - so the phone is unconditional here.
    """

    id: UUID
    full_name: str
    phone: str
    booking_id: UUID
