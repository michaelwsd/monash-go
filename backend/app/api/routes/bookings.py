from uuid import UUID

from fastapi import APIRouter

from app.api.deps import CurrentUser, SupabaseDep
from app.schemas.booking import Booking, BookingCreate, BookingResponse
from app.services import booking_service

router = APIRouter(prefix="/bookings", tags=["bookings"])


@router.post("", response_model=BookingResponse, status_code=201)
def create_booking(payload: BookingCreate, clerk_id: CurrentUser, db: SupabaseDep) -> Booking:
    return booking_service.create(db, clerk_id=clerk_id, payload=payload)


@router.get("/me", response_model=list[BookingResponse])
def get_bookings(clerk_id: CurrentUser, db: SupabaseDep) -> list[Booking]:
    return booking_service.list_for_user(db, clerk_id=clerk_id)


@router.delete("/{booking_id}", response_model=Booking)
def cancel_booking(clerk_id: CurrentUser, booking_id: UUID, db: SupabaseDep) -> Booking:
    return booking_service.cancel(db, clerk_id=clerk_id, booking_id=booking_id)
