"""REQ-002's storage criterion, against real Postgres.

The requirement is literal: the system stores at least 100 ride offers and all
of them come back through search without database errors. A hundred rows in an
in-memory dict would prove nothing about Postgres - not the check constraints,
not the enum columns, not the TIMESTAMPTZ conversion, not PostgREST's default
page size, which is the thing most likely to quietly truncate this.

Marked `db` and excluded from the default run, so CI needs no credentials.

    uv run pytest -m db

It writes to the same database the app uses and deletes what it wrote, whether
or not the assertions pass.
"""

from collections.abc import Iterator
from datetime import datetime, timedelta
from typing import cast
from uuid import UUID
from zoneinfo import ZoneInfo

import pytest

from app.db.client import get_supabase
from app.repositories import ride_repository, user_repository, vehicle_repository
from app.schemas.enums import Campus
from app.schemas.ride import Ride
from supabase import Client

pytestmark = pytest.mark.db

MELBOURNE = ZoneInfo("Australia/Melbourne")
RIDE_COUNT = 120
ORIGIN: Campus = "clayton"
DESTINATION: Campus = "caulfield"

# far enough out that a real ride can never collide with the fixture's window
SEARCH_DATE = datetime.now(MELBOURNE).date() + timedelta(days=365)


@pytest.fixture(scope="module")
def db() -> Client:
    return get_supabase()


@pytest.fixture(scope="module")
def driver(db: Client) -> Iterator[tuple[UUID, UUID]]:
    """A real user and vehicle to hang the rides off. rides.driver_id and
    vehicle_id are foreign keys, so neither can be invented.

    The user has to already exist, because creating one means a Clerk account.
    The vehicle does not, so this makes its own rather than skipping on a
    database where nobody has registered a car - an acceptance criterion that
    quietly skips is one nobody notices going unchecked.
    """
    # a raw query, because no repository lists arbitrary users - the app only
    # ever looks one up by clerk_id. PostgREST hands back untyped JSON, so the
    # shape is asserted here at the boundary rather than assumed downstream.
    users = cast(list[dict[str, str]], db.table("users").select("id").limit(1).execute().data)
    if not users:
        pytest.skip("no user rows in the database to attach rides to")
    user_id = UUID(users[0]["id"])
    assert user_repository.get_by_id(db, user_id) is not None

    existing = vehicle_repository.list_by_owner(db, owner_id=user_id)
    if existing:
        yield user_id, existing[0].id
        return

    borrowed = vehicle_repository.insert(
        db,
        owner_id=user_id,
        make="Test",
        model="Bulk Fixture",
        year=2020,
        fuel_type="petrol",
        fuel_consumption=7.1,
    )
    try:
        yield user_id, borrowed.id
    finally:
        db.table("vehicles").delete().eq("id", str(borrowed.id)).execute()


@pytest.fixture(scope="module")
def hundred_rides(db: Client, driver: tuple[UUID, UUID]) -> Iterator[list[Ride]]:
    driver_id, vehicle_id = driver
    midnight = datetime.combine(SEARCH_DATE, datetime.min.time(), tzinfo=MELBOURNE)

    created: list[Ride] = []
    try:
        for index in range(RIDE_COUNT):
            created.append(
                ride_repository.insert(
                    db,
                    driver_id=driver_id,
                    vehicle_id=vehicle_id,
                    origin=ORIGIN,
                    destination=DESTINATION,
                    # spread across the day, so ordering has something to do
                    departure_at=midnight + timedelta(minutes=7 * index),
                    total_seats=3,
                    available_seats=3,
                    distance_km=23.24,
                )
            )
        yield created
    finally:
        # deleted whatever happened above, so a failed assertion does not leave
        # 120 rides behind for the next run to trip over
        for ride in created:
            db.table("rides").delete().eq("id", str(ride.id)).execute()


def search_them(db: Client) -> list[Ride]:
    midnight = datetime.combine(SEARCH_DATE, datetime.min.time(), tzinfo=MELBOURNE)
    return ride_repository.search(
        db,
        origin=ORIGIN,
        destination=DESTINATION,
        window_start=midnight,
        window_end=midnight + timedelta(days=1),
    )


def test_every_stored_ride_comes_back_through_search(db: Client, hundred_rides: list[Ride]) -> None:
    """The acceptance criterion itself. A shortfall here is most likely
    PostgREST's default 1000-row cap or a silently applied page size, neither
    of which any unit test can see."""
    found = search_them(db)

    assert len(hundred_rides) == RIDE_COUNT
    assert {ride.id for ride in found} >= {ride.id for ride in hundred_rides}


def test_the_rows_survive_the_round_trip_intact(db: Client, hundred_rides: list[Ride]) -> None:
    """Postgres is what actually enforces the enums, the check constraints and
    the TIMESTAMPTZ conversion. Reading the rows back is what proves it."""
    by_id = {ride.id: ride for ride in search_them(db)}

    for original in hundred_rides:
        stored = by_id[original.id]
        assert stored.origin == ORIGIN
        assert stored.destination == DESTINATION
        assert stored.status == "open"
        assert stored.total_seats == 3
        assert stored.available_seats == 3
        assert stored.distance_km == pytest.approx(23.24)
        # written as Melbourne time, stored as TIMESTAMPTZ, read back in UTC:
        # a different clock reading, the same moment
        assert stored.departure_at == original.departure_at


def test_search_returns_them_in_departure_order(db: Client, hundred_rides: list[Ride]) -> None:
    ours = {ride.id for ride in hundred_rides}
    departures = [ride.departure_at for ride in search_them(db) if ride.id in ours]

    assert departures == sorted(departures)


def test_a_ride_with_no_seats_left_drops_out_of_search(
    db: Client, hundred_rides: list[Ride]
) -> None:
    """The filter a passenger depends on, checked against the real query
    rather than an in-memory list comprehension."""
    target = hundred_rides[0]
    db.table("rides").update({"available_seats": 0}).eq("id", str(target.id)).execute()
    try:
        assert target.id not in {ride.id for ride in search_them(db)}
    finally:
        db.table("rides").update({"available_seats": 3}).eq("id", str(target.id)).execute()


def test_a_ride_on_another_date_is_not_in_this_window(
    db: Client, driver: tuple[UUID, UUID], hundred_rides: list[Ride]
) -> None:
    """The Melbourne window, against real TIMESTAMPTZ columns. A window built
    in UTC starts ten hours late, and a 9am ride falls under the previous day."""
    driver_id, vehicle_id = driver
    next_day = datetime.combine(
        SEARCH_DATE + timedelta(days=1), datetime.min.time(), tzinfo=MELBOURNE
    )
    outsider = ride_repository.insert(
        db,
        driver_id=driver_id,
        vehicle_id=vehicle_id,
        origin=ORIGIN,
        destination=DESTINATION,
        departure_at=next_day + timedelta(hours=9),
        total_seats=3,
        available_seats=3,
        distance_km=23.24,
    )
    try:
        assert outsider.id not in {ride.id for ride in search_them(db)}
    finally:
        db.table("rides").delete().eq("id", str(outsider.id)).execute()
