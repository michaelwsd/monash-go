from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.schemas.enums import BookingStatus


class BookingCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ride_id: UUID


class Booking(BaseModel):
    id: UUID
    ride_id: UUID
    passenger_id: UUID
    status: BookingStatus
    created_at: datetime


class BookingResponse(BaseModel):
    id: UUID
    ride_id: UUID
    status: BookingStatus
    created_at: datetime


class RpcResult(BaseModel):
    """book_seat and cancel_booking both return (result, booking_id)."""

    result: str
    booking_id: UUID | None
