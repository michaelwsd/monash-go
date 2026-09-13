"""Two people, one seat.

This is the only place in the product where two users genuinely collide, and
it is the reason bookings go through a Postgres function instead of the
read-check-write every other endpoint uses. Read the seat count in Python,
decide, then write, and there is a window between the read and the write where
a second request reads the same count and decides the same thing. Both succeed.
One seat, two passengers - or `available_seats = -1`.

That window is invisible to manual testing and to every other test in this
suite, because nothing else runs two requests at once. So this test exists to
fail first, and the SQL function in supabase/migrations/0003_book_seat.sql
exists to make it pass.

It needs real Postgres: the race is between two database transactions, and an
in-memory fake has no transactions to race. Marked `db` and out of the default
run, so CI needs no credentials.

    uv run pytest -m db tests/integration/test_booking_concurrency.py

Everything it writes is deleted afterwards, whether or not the assertions pass.
"""

import threading
from collections.abc import Callable, Iterator
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from typing import cast
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app.core import security
from app.db.client import get_supabase
from app.main import app
from app.repositories import ride_repository, user_repository, vehicle_repository
from app.schemas.enums import Campus
from supabase import Client
from tests.conftest import TEST_ISSUER, fake_settings

pytestmark = pytest.mark.db

BOOKINGS_URL = "/api/v1/bookings"

ORIGIN: Campus = "clayton"
DESTINATION: Campus = "caulfield"

# More contenders than seats, obviously. Ten is enough to lose a race reliably
# without making the fixture slow.
CONTENDERS = 10

# A race that passes once has proved nothing: the losing interleaving may simply
# not have happened. Five rounds, each on a fresh ride.
ROUNDS = 5


@pytest.fixture(scope="module")
def db() -> Client:
    return get_supabase()


@pytest.fixture(scope="module")
def driver(db: Client) -> Iterator[tuple[UUID, UUID]]:
    """Someone to own the ride, and a car to attach it to.

    The driver has to be an existing row - making one means a Clerk account.
    The vehicle does not, so it is created and removed here rather than
    skipping on a database where nobody has registered a car.
    """
    users = cast(list[dict[str, str]], db.table("users").select("id").limit(1).execute().data)
    if not users:
        pytest.skip("no user rows in the database to own a ride")
    driver_id = UUID(users[0]["id"])

    existing = vehicle_repository.list_by_owner(db, owner_id=driver_id)
    if existing:
        yield driver_id, existing[0].id
        return

    borrowed = vehicle_repository.insert(
        db,
        owner_id=driver_id,
        make="Test",
        model="Concurrency Fixture",
        year=2020,
        fuel_type="petrol",
        fuel_consumption=7.1,
    )
    try:
        yield driver_id, borrowed.id
    finally:
        db.table("vehicles").delete().eq("id", str(borrowed.id)).execute()


@pytest.fixture(scope="module")
def passengers(db: Client) -> Iterator[list[str]]:
    """Ten distinct users, returned as clerk_ids.

    They must be distinct. bookings has UNIQUE (ride_id, passenger_id), so ten
    attempts from one passenger would be refused by that constraint and the
    seat count would never be contended - the test would pass while proving
    nothing about the race it was written for.

    Created straight through the repository: POST /users/sync would need ten
    real Clerk accounts, and nothing here exercises sign-up.
    """
    clerk_ids = [f"user_race_{index}" for index in range(CONTENDERS)]
    for index, clerk_id in enumerate(clerk_ids):
        user_repository.create_if_absent(
            db,
            clerk_id=clerk_id,
            email=f"race{index}@student.monash.edu",
            full_name=f"Race Tester {index}",
        )
    try:
        yield clerk_ids
    finally:
        # bookings.passenger_id is ON DELETE CASCADE, so this takes their
        # bookings with it
        for clerk_id in clerk_ids:
            db.table("users").delete().eq("clerk_id", clerk_id).execute()


@pytest.fixture
def clerk_verifies_test_tokens(
    monkeypatch: pytest.MonkeyPatch, rsa_keys: tuple[str, str]
) -> Iterator[None]:
    """The real app against the real database.

    Only Clerk is faked, and only so tokens can be signed locally - the
    repositories are left alone, because a fake repository has nothing to race.
    """
    _, public_pem = rsa_keys
    monkeypatch.setattr(
        security,
        "get_settings",
        lambda: fake_settings().model_copy(
            update={"clerk_pem_public_key": public_pem, "clerk_issuer": TEST_ISSUER}
        ),
    )
    yield
    app.dependency_overrides.clear()


def one_seat_ride(db: Client, driver: tuple[UUID, UUID]) -> UUID:
    driver_id, vehicle_id = driver
    ride = ride_repository.insert(
        db,
        driver_id=driver_id,
        vehicle_id=vehicle_id,
        origin=ORIGIN,
        destination=DESTINATION,
        departure_at=datetime.now(UTC) + timedelta(days=30),
        total_seats=1,
        available_seats=1,
        distance_km=23.24,
    )
    return ride.id


def book_all_at_once(
    make_token: Callable[..., str], ride_id: UUID, clerk_ids: list[str]
) -> list[int]:
    """Fire one booking per passenger as simultaneously as threads allow.

    The Barrier is the whole technique. Without it the pool starts threads a
    few hundred microseconds apart, which is long enough for each request to
    finish before the next begins - the requests would be concurrent on paper
    and sequential in practice, and the test would pass against code with the
    bug still in it. Every thread does its setup, then blocks on the barrier;
    the barrier releases all ten at once, so they arrive together.

    One TestClient per thread, not one shared. TestClient drives the ASGI app
    through a single blocking portal, and ten threads pushing requests into it
    at once corrupt each other's transport - it fails with "Server
    disconnected" before any of the booking code runs. Building the client is
    part of each thread's setup, so it happens before the barrier and does not
    stagger the requests.
    """
    barrier = threading.Barrier(len(clerk_ids))

    def attempt(clerk_id: str) -> int:
        client = TestClient(app)
        headers = {"Authorization": f"Bearer {make_token(sub=clerk_id)}"}
        body = {"ride_id": str(ride_id)}
        barrier.wait()
        return client.post(BOOKINGS_URL, json=body, headers=headers).status_code

    with ThreadPoolExecutor(max_workers=len(clerk_ids)) as pool:
        return list(pool.map(attempt, clerk_ids))


def seats_left(db: Client, ride_id: UUID) -> int:
    rows = cast(
        list[dict[str, int]],
        db.table("rides").select("available_seats").eq("id", str(ride_id)).execute().data,
    )
    return rows[0]["available_seats"]


def confirmed_bookings(db: Client, ride_id: UUID) -> int:
    rows = cast(
        list[dict[str, str]],
        db.table("bookings")
        .select("id")
        .eq("ride_id", str(ride_id))
        .eq("status", "confirmed")
        .execute()
        .data,
    )
    return len(rows)


def test_ten_passengers_race_for_one_seat(
    db: Client,
    clerk_verifies_test_tokens: None,
    driver: tuple[UUID, UUID],
    passengers: list[str],
    make_token: Callable[..., str],
) -> None:
    """The sprint's acceptance criterion, run five times over.

    Every assertion is inside the loop so a failing round names its own number
    rather than leaving you to guess which one broke.
    """
    for round_number in range(1, ROUNDS + 1):
        ride_id = one_seat_ride(db, driver)
        try:
            codes = book_all_at_once(make_token, ride_id, passengers)

            # A 500 means the race was lost inside the database and the error
            # escaped as a crash. It is a distinct failure from "two bookings
            # succeeded", and worth naming separately.
            assert 500 not in codes, f"round {round_number}: a request crashed, got {codes}"

            assert codes.count(201) == 1, (
                f"round {round_number}: {codes.count(201)} passengers got the one seat, "
                f"status codes were {codes}"
            )

            # Everyone else is turned away for a reason the frontend can act
            # on: the ride filled up. Not a 400, which would say they sent
            # something wrong, and not a 500.
            losers = [code for code in codes if code != 201]
            assert set(losers) == {409}, f"round {round_number}: losers got {sorted(set(losers))}"

            assert confirmed_bookings(db, ride_id) == 1, (
                f"round {round_number}: the seat count and the bookings table disagree"
            )

            # The number that must never go below zero. A negative here is the
            # signature of two decrements landing on one read.
            assert seats_left(db, ride_id) == 0, f"round {round_number}: seats did not reach zero"
        finally:
            # bookings.ride_id is ON DELETE CASCADE, so this clears both tables
            db.table("rides").delete().eq("id", str(ride_id)).execute()


def test_a_second_booking_by_the_same_passenger_is_refused(
    db: Client,
    clerk_verifies_test_tokens: None,
    driver: tuple[UUID, UUID],
    passengers: list[str],
    make_token: Callable[..., str],
) -> None:
    """The other way a seat count can go wrong, and the reason the race above
    needs ten distinct passengers rather than one impatient passenger.

    UNIQUE (ride_id, passenger_id) makes the second insert impossible, but a
    naive implementation could still decrement the seat before discovering
    that. Then the ride loses a seat to a booking that does not exist.
    """
    ride_id = one_seat_ride(db, driver)
    client = TestClient(app)
    headers = {"Authorization": f"Bearer {make_token(sub=passengers[0])}"}
    body = {"ride_id": str(ride_id)}
    try:
        assert client.post(BOOKINGS_URL, json=body, headers=headers).status_code == 201
        assert client.post(BOOKINGS_URL, json=body, headers=headers).status_code == 409
        assert confirmed_bookings(db, ride_id) == 1
        assert seats_left(db, ride_id) == 0
    finally:
        db.table("rides").delete().eq("id", str(ride_id)).execute()
