"""Booking at the service layer, against in-memory fakes.

The interesting logic is thin on purpose: Postgres owns the seat arithmetic
(supabase/migrations/0003_book_seat.sql), and the race is proved separately in
tests/integration/test_booking_concurrency.py against a real database.

What is left here is the translation layer, and it is worth testing because it
is where a word becomes a status code. 'ride_full' has to reach the frontend as
a 409 that says the ride filled up, not as a 500 that says nothing, and not as
a silent success.

Two rules the SQL deliberately does not enforce also live here: a driver may not
book their own ride, and booking one promotes a driver to 'both'.
"""

from datetime import UTC, datetime, timedelta
from typing import Any, cast
from uuid import UUID, uuid4

import pytest

from app.exceptions.errors import AlreadyBookedError, NotFoundError, RideFullError
from app.schemas.booking import Booking, BookingCreate
from app.schemas.enums import UserRole
from app.schemas.ride import Ride
from app.schemas.user import User
from app.services import booking_service
from supabase import Client

# the fakes never touch it, so there is nothing real to pass
DB = cast(Client, None)

PASSENGER = User(
    id=uuid4(),
    clerk_id="user_passenger",
    email="p@student.monash.edu",
    phone="0400000000",
    full_name="Pat Passenger",
    role="passenger",
    is_concession=True,
    home_campus="clayton",
    green_points=0,
    joined_at=datetime.now(UTC),
)

DRIVER = PASSENGER.model_copy(
    update={
        "id": uuid4(),
        "clerk_id": "user_driver",
        "full_name": "Dana Driver",
        "role": "driver",
    }
)


def ride(**overrides: Any) -> Ride:
    fields: dict[str, Any] = {
        "id": uuid4(),
        "driver_id": DRIVER.id,
        "vehicle_id": uuid4(),
        "origin": "clayton",
        "destination": "caulfield",
        "departure_at": datetime.now(UTC) + timedelta(days=1),
        "total_seats": 3,
        "available_seats": 3,
        "distance_km": 23.24,
        "status": "open",
        "co2_saved": None,
        "points_earned": None,
        "created_at": datetime.now(UTC),
    }
    fields.update(overrides)
    return Ride(**fields)


RIDE = ride()


class FakeUserRepo:
    """Holds both users mutably, so a role promotion is visible to the test."""

    def __init__(self) -> None:
        self.rows = {user.clerk_id: user for user in (PASSENGER, DRIVER)}

    def get_by_clerk_id(self, db: object, clerk_id: str) -> User | None:
        return self.rows.get(clerk_id)

    def get_by_id(self, db: object, user_id: UUID) -> User | None:
        return next((user for user in self.rows.values() if user.id == user_id), None)

    def set_role(self, db: object, *, clerk_id: str, role: UserRole) -> User | None:
        if clerk_id not in self.rows:
            return None
        self.rows[clerk_id] = self.rows[clerk_id].model_copy(update={"role": role})
        return self.rows[clerk_id]


class FakeRideRepo:
    def __init__(self, row: Ride | None = RIDE) -> None:
        self.row = row

    def get_ride(self, db: object, ride_id: UUID) -> Ride | None:
        return self.row if self.row and self.row.id == ride_id else None


class FakeBookingRepo:
    """Stands in for the Postgres function.

    `result` is whichever word the SQL would have returned, handed in by the
    test. Nothing here models seats: reimplementing the seat arithmetic in
    Python would only prove the fake agrees with itself, and the real thing is
    covered against a real database in test_booking_concurrency.py.
    """

    def __init__(self, result: str = "booked", cancel_result: str = "cancelled") -> None:
        self.result = result
        self.cancel_result = cancel_result
        self.book_calls: list[tuple[UUID, UUID]] = []
        self.cancel_calls: list[tuple[UUID, UUID]] = []
        self.booking_id = uuid4()

    def book_seat(
        self, db: object, *, ride_id: UUID, passenger_id: UUID
    ) -> tuple[str, UUID | None]:
        self.book_calls.append((ride_id, passenger_id))
        if self.result != "booked":
            return self.result, None
        return self.result, self.booking_id

    def cancel(self, db: object, *, booking_id: UUID, passenger_id: UUID) -> str:
        self.cancel_calls.append((booking_id, passenger_id))
        return self.cancel_result

    def get_by_id(self, db: object, booking_id: UUID) -> Booking | None:
        if booking_id != self.booking_id:
            return None
        return Booking(
            id=self.booking_id,
            ride_id=RIDE.id,
            passenger_id=PASSENGER.id,
            status="confirmed",
            created_at=datetime.now(UTC),
        )

    def list_for_passenger(self, db: object, *, passenger_id: UUID) -> list[Booking]:
        booking = self.get_by_id(db, self.booking_id)
        return [booking] if booking and passenger_id == PASSENGER.id else []


def install(
    monkeypatch: pytest.MonkeyPatch,
    *,
    result: str = "booked",
    cancel_result: str = "cancelled",
    ride_row: Ride | None = RIDE,
) -> tuple[FakeBookingRepo, FakeUserRepo]:
    bookings = FakeBookingRepo(result=result, cancel_result=cancel_result)
    users = FakeUserRepo()
    rides = FakeRideRepo(ride_row)
    monkeypatch.setattr(booking_service, "booking_repository", bookings)
    monkeypatch.setattr(booking_service, "user_repository", users)
    monkeypatch.setattr(booking_service, "ride_repository", rides)
    return bookings, users


def book(clerk_id: str = PASSENGER.clerk_id, ride_id: UUID | None = None) -> Booking:
    return booking_service.create(
        DB, clerk_id=clerk_id, payload=BookingCreate(ride_id=ride_id or RIDE.id)
    )


# --- the happy path ------------------------------------------------------


def test_booking_a_ride_returns_the_stored_booking(monkeypatch: pytest.MonkeyPatch) -> None:
    bookings, _ = install(monkeypatch)

    booking = book()

    assert booking.id == bookings.booking_id
    assert booking.ride_id == RIDE.id
    assert booking.passenger_id == PASSENGER.id
    assert booking.status == "confirmed"


def test_the_passenger_comes_from_the_token_not_the_body(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """BookingCreate carries only a ride_id. Anything else and one passenger
    could book a seat in another passenger's name."""
    bookings, _ = install(monkeypatch)

    book()

    assert bookings.book_calls == [(RIDE.id, PASSENGER.id)]


# --- the result words the SQL can return ---------------------------------


@pytest.mark.parametrize(
    ("result", "expected"),
    [
        ("ride_full", RideFullError),
        ("already_booked", AlreadyBookedError),
        ("ride_not_found", NotFoundError),
    ],
)
def test_each_refusal_becomes_its_own_error(
    monkeypatch: pytest.MonkeyPatch, result: str, expected: type[Exception]
) -> None:
    """The translation this service exists for. Collapsing these into one error
    would leave the frontend unable to tell "someone beat you to it" from "you
    already have a seat", which are different things to tell a passenger."""
    install(monkeypatch, result=result)

    with pytest.raises(expected):
        book()


def test_an_unrecognised_result_is_not_treated_as_success(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """If someone adds a value to the booking_result enum and forgets to map
    it, the booking must fail loudly. Falling through to a return would hand
    back a booking that was never made."""
    install(monkeypatch, result="something_new")

    with pytest.raises(Exception):  # noqa: B017 - any error beats a false success
        book()


# --- rules the SQL deliberately leaves to the service --------------------


def test_a_driver_cannot_book_their_own_ride(monkeypatch: pytest.MonkeyPatch) -> None:
    """book_seat would give them the seat: it knows nothing about who is
    driving. The emissions maths counts occupants as passengers + 1, so a
    driver in their own passenger list is double-counted, and every CO2 and
    points figure for that ride comes out wrong."""
    bookings, _ = install(monkeypatch)

    with pytest.raises(Exception):  # noqa: B017 - the type is the service's choice
        book(clerk_id=DRIVER.clerk_id)

    assert bookings.book_calls == []


def test_booking_promotes_a_driver_to_both(monkeypatch: pytest.MonkeyPatch) -> None:
    """The mirror of vehicle_service.promote_to_driver, whose docstring hands
    this direction to Sprint 4. A driver who books a seat on someone else's
    ride is now both."""
    _, users = install(monkeypatch)
    other_ride = ride(driver_id=uuid4())
    monkeypatch.setattr(booking_service, "ride_repository", FakeRideRepo(other_ride))

    book(clerk_id=DRIVER.clerk_id, ride_id=other_ride.id)

    assert users.rows[DRIVER.clerk_id].role == "both"


def test_a_passenger_booking_stays_a_passenger(monkeypatch: pytest.MonkeyPatch) -> None:
    """Only 'driver' is promoted. 'passenger' is already right, and promoting
    it would claim they own a car."""
    _, users = install(monkeypatch)

    book()

    assert users.rows[PASSENGER.clerk_id].role == "passenger"


def test_a_caller_with_no_user_row_is_a_not_found(monkeypatch: pytest.MonkeyPatch) -> None:
    bookings, _ = install(monkeypatch)

    with pytest.raises(NotFoundError):
        book(clerk_id="user_nobody")

    assert bookings.book_calls == []


# --- cancelling ----------------------------------------------------------


def test_cancelling_passes_the_caller_through_to_the_function(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The passenger id is what stops someone cancelling a stranger's seat, and
    it comes from the token. The check itself is in the SQL, which is why this
    asserts what was handed over rather than the outcome."""
    bookings, _ = install(monkeypatch)

    booking_service.cancel(DB, clerk_id=PASSENGER.clerk_id, booking_id=bookings.booking_id)

    assert bookings.cancel_calls == [(bookings.booking_id, PASSENGER.id)]


def test_cancelling_a_booking_that_is_not_yours_is_a_not_found(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    install(monkeypatch, cancel_result="booking_not_found")

    with pytest.raises(NotFoundError):
        booking_service.cancel(DB, clerk_id=PASSENGER.clerk_id, booking_id=uuid4())


def test_cancelling_twice_is_not_an_error(monkeypatch: pytest.MonkeyPatch) -> None:
    """cancel_booking is idempotent by design - the second call returns
    'cancelled' without handing back a second seat. The service must not turn
    that into a failure."""
    bookings, _ = install(monkeypatch)

    booking_service.cancel(DB, clerk_id=PASSENGER.clerk_id, booking_id=bookings.booking_id)
    booking_service.cancel(DB, clerk_id=PASSENGER.clerk_id, booking_id=bookings.booking_id)

    assert len(bookings.cancel_calls) == 2


# --- listing -------------------------------------------------------------


def test_listing_returns_only_the_callers_bookings(monkeypatch: pytest.MonkeyPatch) -> None:
    install(monkeypatch)

    mine = booking_service.list_for_user(DB, clerk_id=PASSENGER.clerk_id)
    theirs = booking_service.list_for_user(DB, clerk_id=DRIVER.clerk_id)

    assert [booking.passenger_id for booking in mine] == [PASSENGER.id]
    assert theirs == []
