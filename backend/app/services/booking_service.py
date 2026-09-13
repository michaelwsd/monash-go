from uuid import UUID

from app.exceptions.errors import (
    AlreadyBookedError,
    DomainError,
    InvalidInputError,
    NotFoundError,
    RideFullError,
)
from app.repositories import booking_repository, ride_repository, user_repository
from app.schemas.booking import Booking, BookingCreate
from supabase import Client

BOOKING_ERRORS: dict[str, type[DomainError]] = {
    "ride_full": RideFullError,
    "already_booked": AlreadyBookedError,
    "ride_not_found": NotFoundError,
    # cancel_booking reports someone else's booking as not found too, rather
    # than as a refusal: "that exists but is not yours" confirms the id is
    # real, which is more than a stranger needs to know.
    "booking_not_found": NotFoundError,
}


def create(db: Client, *, clerk_id: str, payload: BookingCreate) -> Booking:
    # create a booking for the user and ride
    passenger = user_repository.get_by_clerk_id(db, clerk_id)
    ride = ride_repository.get_ride(db, payload.ride_id)

    if not passenger or not ride:
        raise NotFoundError("user or ride not found")

    if ride.driver_id == passenger.id:
        raise InvalidInputError("driver of the ride can't be a passenger")

    # book seat
    result, booking_id = booking_repository.book_seat(
        db, ride_id=payload.ride_id, passenger_id=passenger.id
    )
    if result != "booked" or booking_id is None:
        raise BOOKING_ERRORS.get(result, DomainError)(f"could not book: {result}")

    # promote if user is a driver
    if passenger.role == "driver":
        user_repository.set_role(db, clerk_id=clerk_id, role="both")

    booking = booking_repository.get_by_id(db, booking_id)
    if not booking:
        raise NotFoundError("booking not found")
    return booking


def cancel(db: Client, *, clerk_id: str, booking_id: UUID) -> Booking:
    passenger = user_repository.get_by_clerk_id(db, clerk_id)
    booking = booking_repository.get_by_id(db, booking_id)

    if not passenger or not booking:
        raise NotFoundError("user or booking not found")

    result = booking_repository.cancel(db, booking_id=booking_id, passenger_id=passenger.id)
    if result != "cancelled":
        raise BOOKING_ERRORS.get(result, DomainError)(f"could not cancel: {result}")

    booking = booking_repository.get_by_id(db, booking_id)
    if not booking:
        raise NotFoundError("booking not found")
    return booking


def list_for_user(db: Client, *, clerk_id: str) -> list[Booking]:
    passenger = user_repository.get_by_clerk_id(db, clerk_id)
    if not passenger:
        raise NotFoundError("user not found")

    return booking_repository.list_for_passenger(db, passenger_id=passenger.id)
