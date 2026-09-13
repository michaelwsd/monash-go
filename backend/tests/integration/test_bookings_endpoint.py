"""The three /bookings endpoints on the real app.

test_booking_service.py already proves the translation from result word to
domain error. This proves the wiring it cannot see: the router mounts at
/api/v1, RideFullError surfaces as a 409 rather than a 500, and the response
keeps passenger_id off the wire.

The seat arithmetic is not tested here and deliberately so - it lives in
Postgres, and the only honest test of it is ten simultaneous requests against a
real database, which is tests/integration/test_booking_concurrency.py.
"""

from collections.abc import Callable, Iterator
from datetime import UTC, datetime, timedelta
from typing import Any, cast
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app.core import security
from app.core.config import get_settings
from app.db.client import get_supabase
from app.main import app
from app.schemas.booking import Booking
from app.schemas.enums import UserRole
from app.schemas.ride import Ride
from app.schemas.user import User
from app.services import booking_service
from supabase import Client
from tests.conftest import TEST_ISSUER, fake_settings

BOOKINGS_URL = "/api/v1/bookings"

CLERK_ID = "user_2abc123"

PASSENGER = User(
    id=uuid4(),
    clerk_id=CLERK_ID,
    email="test@student.monash.edu",
    phone="0400000000",
    full_name="Test User",
    role="passenger",
    is_concession=True,
    home_campus="clayton",
    green_points=0,
    joined_at=datetime.now(UTC),
)

DRIVER = PASSENGER.model_copy(
    update={"id": uuid4(), "clerk_id": "user_driver", "full_name": "Dana Driver", "role": "driver"}
)

RIDE = Ride(
    id=uuid4(),
    driver_id=DRIVER.id,
    vehicle_id=uuid4(),
    origin="clayton",
    destination="caulfield",
    departure_at=datetime.now(UTC) + timedelta(days=1),
    total_seats=3,
    available_seats=3,
    distance_km=23.24,
    status="open",
    co2_saved=None,
    points_earned=None,
    created_at=datetime.now(UTC),
)


# A ride DRIVER does not own, so they can legitimately book a seat on it.
OTHER_RIDE = RIDE.model_copy(update={"id": uuid4(), "driver_id": uuid4()})


class FakeUserRepo:
    def __init__(self) -> None:
        self.rows = {user.clerk_id: user for user in (PASSENGER, DRIVER)}

    def get_by_clerk_id(self, db: object, clerk_id: str) -> User | None:
        return self.rows.get(clerk_id)

    def set_role(self, db: object, *, clerk_id: str, role: UserRole) -> User | None:
        if clerk_id not in self.rows:
            return None
        self.rows[clerk_id] = self.rows[clerk_id].model_copy(update={"role": role})
        return self.rows[clerk_id]


class FakeRideRepo:
    def get_ride(self, db: object, ride_id: UUID) -> Ride | None:
        return next((ride for ride in (RIDE, OTHER_RIDE) if ride.id == ride_id), None)


class FakeBookingRepo:
    """Stands in for the Postgres functions. `result` is the word they would
    have returned, set by whichever test is running."""

    def __init__(self) -> None:
        self.result = "booked"
        self.cancel_result = "cancelled"
        self.booking_id = uuid4()
        self.status = "confirmed"

    def book_seat(
        self, db: object, *, ride_id: UUID, passenger_id: UUID
    ) -> tuple[str, UUID | None]:
        if self.result != "booked":
            return self.result, None
        return self.result, self.booking_id

    def cancel(self, db: object, *, booking_id: UUID, passenger_id: UUID) -> str:
        if self.cancel_result == "cancelled":
            self.status = "cancelled"
        return self.cancel_result

    def get_by_id(self, db: object, booking_id: UUID) -> Booking | None:
        if booking_id != self.booking_id:
            return None
        return Booking(
            id=self.booking_id,
            ride_id=RIDE.id,
            passenger_id=PASSENGER.id,
            status=cast(Any, self.status),
            created_at=datetime.now(UTC),
        )

    def list_for_passenger(self, db: object, *, passenger_id: UUID) -> list[Booking]:
        booking = self.get_by_id(db, self.booking_id)
        return [booking] if booking and passenger_id == PASSENGER.id else []


@pytest.fixture
def wired(
    monkeypatch: pytest.MonkeyPatch, rsa_keys: tuple[str, str]
) -> Iterator[tuple[TestClient, FakeBookingRepo, FakeUserRepo]]:
    _, public_pem = rsa_keys
    settings = fake_settings().model_copy(
        update={"clerk_pem_public_key": public_pem, "clerk_issuer": TEST_ISSUER}
    )
    monkeypatch.setattr(security, "get_settings", lambda: settings)

    bookings, users = FakeBookingRepo(), FakeUserRepo()
    monkeypatch.setattr(booking_service, "booking_repository", bookings)
    monkeypatch.setattr(booking_service, "user_repository", users)
    monkeypatch.setattr(booking_service, "ride_repository", FakeRideRepo())

    app.dependency_overrides[get_settings] = fake_settings
    app.dependency_overrides[get_supabase] = lambda: cast(Client, None)
    yield TestClient(app), bookings, users
    app.dependency_overrides.clear()


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def book(client: TestClient, token: str, ride_id: UUID | None = None) -> Any:
    return client.post(BOOKINGS_URL, json={"ride_id": str(ride_id or RIDE.id)}, headers=auth(token))


# --- POST /bookings ------------------------------------------------------


def test_booking_a_seat_returns_201_and_the_booking(
    wired: tuple[TestClient, FakeBookingRepo, FakeUserRepo], make_token: Callable[..., str]
) -> None:
    client, bookings, _ = wired

    response = book(client, make_token(sub=CLERK_ID))

    assert response.status_code == 201
    payload = response.json()
    assert payload["id"] == str(bookings.booking_id)
    assert payload["ride_id"] == str(RIDE.id)
    assert payload["status"] == "confirmed"


def test_the_response_does_not_repeat_the_passenger_back(
    wired: tuple[TestClient, FakeBookingRepo, FakeUserRepo], make_token: Callable[..., str]
) -> None:
    """BookingResponse omits passenger_id: it is always the caller, so sending
    it back tells them nothing they did not already know."""
    client, _, _ = wired

    payload = book(client, make_token(sub=CLERK_ID)).json()

    assert "passenger_id" not in payload


def test_booking_promotes_a_driver_to_both(
    wired: tuple[TestClient, FakeBookingRepo, FakeUserRepo], make_token: Callable[..., str]
) -> None:
    """The mirror of vehicle_service.promote_to_driver. Someone who drives and
    also takes seats is 'both', and the rewards and trip screens read that."""
    client, _, users = wired

    # OTHER_RIDE, not RIDE: a driver may not book the ride they are driving,
    # so booking their own would be refused before any promotion happened.
    response = book(client, make_token(sub=DRIVER.clerk_id), ride_id=OTHER_RIDE.id)

    assert response.status_code == 201
    assert users.rows[DRIVER.clerk_id].role == "both"


@pytest.mark.parametrize(
    ("result", "expected"),
    [("ride_full", 409), ("already_booked", 409), ("ride_not_found", 404)],
)
def test_each_refusal_has_its_own_status_code(
    wired: tuple[TestClient, FakeBookingRepo, FakeUserRepo],
    make_token: Callable[..., str],
    result: str,
    expected: int,
) -> None:
    """The reason the service translates at all. Uncaught, every one of these
    would be a 500 and the frontend could not tell them apart."""
    client, bookings, _ = wired
    bookings.result = result

    assert book(client, make_token(sub=CLERK_ID)).status_code == expected


def test_a_driver_booking_their_own_ride_is_refused(
    wired: tuple[TestClient, FakeBookingRepo, FakeUserRepo], make_token: Callable[..., str]
) -> None:
    """The emissions maths counts occupants as passengers + 1, so a driver in
    their own passenger list is counted twice."""
    client, _, _ = wired

    response = book(client, make_token(sub=DRIVER.clerk_id))

    assert response.status_code == 400


def test_a_ride_that_does_not_exist_is_404(
    wired: tuple[TestClient, FakeBookingRepo, FakeUserRepo], make_token: Callable[..., str]
) -> None:
    client, _, _ = wired

    assert book(client, make_token(sub=CLERK_ID), ride_id=uuid4()).status_code == 404


def test_booking_without_a_token_is_401(
    wired: tuple[TestClient, FakeBookingRepo, FakeUserRepo],
) -> None:
    client, _, _ = wired

    assert client.post(BOOKINGS_URL, json={"ride_id": str(RIDE.id)}).status_code == 401


@pytest.mark.parametrize(
    ("label", "body"),
    [
        ("no ride_id", {}),
        ("a ride_id that is not a uuid", {"ride_id": "banana"}),
        ("a field the schema forbids", {"ride_id": str(RIDE.id), "passenger_id": str(uuid4())}),
    ],
)
def test_a_malformed_body_is_422(
    wired: tuple[TestClient, FakeBookingRepo, FakeUserRepo],
    make_token: Callable[..., str],
    label: str,
    body: dict[str, str],
) -> None:
    """The last case is the one that matters: extra='forbid' is what stops a
    caller naming a different passenger and booking a seat in their name."""
    client, _, _ = wired

    response = client.post(BOOKINGS_URL, json=body, headers=auth(make_token(sub=CLERK_ID)))

    assert response.status_code == 422, label


# --- DELETE /bookings/{id} -----------------------------------------------


def test_cancelling_returns_the_cancelled_booking(
    wired: tuple[TestClient, FakeBookingRepo, FakeUserRepo], make_token: Callable[..., str]
) -> None:
    client, bookings, _ = wired

    response = client.delete(
        f"{BOOKINGS_URL}/{bookings.booking_id}", headers=auth(make_token(sub=CLERK_ID))
    )

    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"


def test_cancelling_twice_is_not_an_error(
    wired: tuple[TestClient, FakeBookingRepo, FakeUserRepo], make_token: Callable[..., str]
) -> None:
    """cancel_booking is idempotent in SQL, and the endpoint must not undo
    that: a passenger who taps cancel twice has not done anything wrong."""
    client, bookings, _ = wired
    url = f"{BOOKINGS_URL}/{bookings.booking_id}"
    headers = auth(make_token(sub=CLERK_ID))

    assert client.delete(url, headers=headers).status_code == 200
    assert client.delete(url, headers=headers).status_code == 200


def test_cancelling_someone_elses_booking_is_404(
    wired: tuple[TestClient, FakeBookingRepo, FakeUserRepo], make_token: Callable[..., str]
) -> None:
    """Not a 403. "That booking exists but is not yours" confirms the id is
    real, which is more than a stranger needs to know."""
    client, bookings, _ = wired
    bookings.cancel_result = "booking_not_found"

    response = client.delete(
        f"{BOOKINGS_URL}/{bookings.booking_id}", headers=auth(make_token(sub=CLERK_ID))
    )

    assert response.status_code == 404


def test_a_booking_id_that_is_not_a_uuid_is_422(
    wired: tuple[TestClient, FakeBookingRepo, FakeUserRepo], make_token: Callable[..., str]
) -> None:
    client, _, _ = wired

    response = client.delete(f"{BOOKINGS_URL}/banana", headers=auth(make_token(sub=CLERK_ID)))

    assert response.status_code == 422


def test_cancelling_without_a_token_is_401(
    wired: tuple[TestClient, FakeBookingRepo, FakeUserRepo],
) -> None:
    client, bookings, _ = wired

    assert client.delete(f"{BOOKINGS_URL}/{bookings.booking_id}").status_code == 401


# --- GET /bookings/me ----------------------------------------------------


def test_my_bookings_returns_only_mine(
    wired: tuple[TestClient, FakeBookingRepo, FakeUserRepo], make_token: Callable[..., str]
) -> None:
    client, _, _ = wired

    mine = client.get(f"{BOOKINGS_URL}/me", headers=auth(make_token(sub=CLERK_ID)))
    theirs = client.get(f"{BOOKINGS_URL}/me", headers=auth(make_token(sub=DRIVER.clerk_id)))

    assert mine.status_code == 200
    assert len(mine.json()) == 1
    assert theirs.json() == []


def test_me_is_not_swallowed_by_the_id_route(
    wired: tuple[TestClient, FakeBookingRepo, FakeUserRepo], make_token: Callable[..., str]
) -> None:
    """/bookings/me and /bookings/{booking_id} share a shape. They differ by
    method today, but the ordering is the habit that keeps it working if a
    GET /bookings/{id} is ever added."""
    client, _, _ = wired

    response = client.get(f"{BOOKINGS_URL}/me", headers=auth(make_token(sub=CLERK_ID)))

    assert response.status_code == 200


def test_listing_without_a_token_is_401(
    wired: tuple[TestClient, FakeBookingRepo, FakeUserRepo],
) -> None:
    client, _, _ = wired

    assert client.get(f"{BOOKINGS_URL}/me").status_code == 401
