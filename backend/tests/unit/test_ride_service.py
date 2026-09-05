"""Ride creation at the service layer, against in-memory fakes.

Three rules are worth a test each, and they are the three a driver could
otherwise bend: the car must be theirs, the distance must come from the route
cache rather than the request, and the seats must start full.
"""

from datetime import UTC, date, datetime, timedelta
from typing import Any, cast
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

import httpx
import pytest

from app.exceptions.errors import InvalidInputError, NotFoundError, PermissionDeniedError
from app.schemas.enums import Campus, TravelMode
from app.schemas.ride import Ride, RideCreate
from app.schemas.route import CampusRoute
from app.schemas.user import User
from app.schemas.vehicle import Vehicle
from app.services import ride_service
from supabase import Client

# the fakes never touch either, so there is nothing real to pass
DB = cast(Client, None)
HTTP = cast(httpx.Client, None)

CACHED_DISTANCE_KM = 23.24

OWNER = User(
    id=uuid4(),
    clerk_id="user_1",
    email="a@student.monash.edu",
    phone="0400000000",
    full_name="A B",
    role="driver",
    is_concession=True,
    home_campus="clayton",
    green_points=0,
    joined_at=datetime.now(UTC),
)

SOMEONE_ELSE_ID = uuid4()


def vehicle(owner_id: UUID | None = None) -> Vehicle:
    return Vehicle(
        id=uuid4(),
        owner_id=owner_id or OWNER.id,
        make="Toyota",
        model="Corolla",
        year=2020,
        fuel_type="petrol",
        fuel_consumption=7.1,
        created_at=datetime.now(UTC),
    )


def payload(vehicle_id: UUID, **overrides: Any) -> RideCreate:
    fields: dict[str, Any] = {
        "vehicle_id": vehicle_id,
        "origin": "clayton",
        "destination": "caulfield",
        "departure_at": datetime.now(UTC) + timedelta(days=1),
        "total_seats": 3,
    }
    fields.update(overrides)
    return RideCreate(**fields)


class FakeUserRepo:
    def get_by_clerk_id(self, db: object, clerk_id: str) -> User | None:
        return OWNER if clerk_id == OWNER.clerk_id else None


class FakeVehicleRepo:
    """Holds one vehicle. Pass None to make every lookup miss."""

    def __init__(self, row: Vehicle | None) -> None:
        self.row = row

    def get_by_id(self, db: object, vehicle_id: UUID) -> Vehicle | None:
        return self.row if self.row and self.row.id == vehicle_id else None


class FakeRideRepo:
    def __init__(self) -> None:
        self.rows: list[Ride] = []
        # what search() was handed. The window is the whole point: the service
        # converts a calendar date into two moments, and only this records them.
        self.window: tuple[datetime, datetime] | None = None
        self.filters: tuple[Campus, Campus] | None = None

    def search(
        self,
        db: object,
        *,
        origin: Campus,
        destination: Campus,
        window_start: datetime,
        window_end: datetime,
    ) -> list[Ride]:
        self.filters = (origin, destination)
        self.window = (window_start, window_end)
        return self.rows

    def insert(self, db: object, **fields: Any) -> Ride:
        ride = Ride(
            id=uuid4(),
            status="open",
            co2_saved=None,
            points_earned=None,
            created_at=datetime.now(UTC),
            **fields,
        )
        self.rows.append(ride)
        return ride


class FakeRouteService:
    """Stands in for the route cache. Records calls, so a test can prove the
    service asked for the drive route rather than inventing a distance."""

    def __init__(self) -> None:
        self.calls: list[tuple[Campus, Campus, TravelMode]] = []

    def get_route(
        self,
        db: object,
        http: object,
        *,
        origin: Campus,
        destination: Campus,
        travel_mode: TravelMode,
    ) -> CampusRoute:
        self.calls.append((origin, destination, travel_mode))
        return CampusRoute(
            id=uuid4(),
            origin=origin,
            destination=destination,
            travel_mode=travel_mode,
            distance_km=CACHED_DISTANCE_KM,
            duration_min=27,
            route_summary="Wellington Rd and M1",
            legs=None,
            cached_at=datetime.now(UTC),
        )


def install(
    monkeypatch: pytest.MonkeyPatch, *, car: Vehicle | None
) -> tuple[FakeRideRepo, FakeRouteService]:
    rides = FakeRideRepo()
    routes = FakeRouteService()
    # set ride_service.user_repository = FakeUserRepo()
    # whenever user_repository is called inside ride_service, it will use FakeUserRepo
    monkeypatch.setattr(ride_service, "user_repository", FakeUserRepo())
    monkeypatch.setattr(ride_service, "vehicle_repository", FakeVehicleRepo(car))
    monkeypatch.setattr(ride_service, "ride_repository", rides)
    monkeypatch.setattr(ride_service, "route_service", routes)
    return rides, routes


def test_a_ride_is_created_against_the_drivers_own_vehicle(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    car = vehicle()
    rides, _ = install(monkeypatch, car=car)

    ride = ride_service.create(DB, HTTP, clerk_id=OWNER.clerk_id, payload=payload(car.id))

    assert ride.driver_id == OWNER.id
    assert ride.vehicle_id == car.id
    assert ride.status == "open"
    assert len(rides.rows) == 1


def test_creating_a_ride_with_someone_elses_vehicle_is_refused(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The check that stops a driver posting rides with a car they do not own."""
    car = vehicle(owner_id=SOMEONE_ELSE_ID)
    rides, routes = install(monkeypatch, car=car)

    with pytest.raises(PermissionDeniedError):
        ride_service.create(DB, HTTP, clerk_id=OWNER.clerk_id, payload=payload(car.id))

    assert rides.rows == []
    # refused before it could cost us a route lookup
    assert routes.calls == []


def test_distance_comes_from_the_route_cache_not_the_request(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """distance_km is what every emissions and points figure multiplies, so a
    driver who could set it could set their own green points. It is not a field
    on RideCreate at all; this proves the service asks the cache instead."""
    car = vehicle()
    _, routes = install(monkeypatch, car=car)

    ride = ride_service.create(DB, HTTP, clerk_id=OWNER.clerk_id, payload=payload(car.id))

    assert ride.distance_km == CACHED_DISTANCE_KM
    assert routes.calls == [("clayton", "caulfield", "drive")]


def test_available_seats_starts_equal_to_total_seats(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    car = vehicle()
    install(monkeypatch, car=car)

    ride = ride_service.create(
        DB, HTTP, clerk_id=OWNER.clerk_id, payload=payload(car.id, total_seats=4)
    )

    assert ride.total_seats == 4
    assert ride.available_seats == 4


def test_a_departure_in_the_past_is_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    """Well-formed but against the rules, so the service rejects it rather than
    the schema: InvalidInputError is a 400, not a 422."""
    car = vehicle()
    rides, _ = install(monkeypatch, car=car)
    yesterday = datetime.now(UTC) - timedelta(days=1)

    with pytest.raises(InvalidInputError):
        ride_service.create(
            DB, HTTP, clerk_id=OWNER.clerk_id, payload=payload(car.id, departure_at=yesterday)
        )

    assert rides.rows == []


def test_a_vehicle_that_does_not_exist_is_a_not_found(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    install(monkeypatch, car=None)

    with pytest.raises(NotFoundError):
        ride_service.create(DB, HTTP, clerk_id=OWNER.clerk_id, payload=payload(uuid4()))


def test_a_caller_with_no_user_row_is_a_not_found(monkeypatch: pytest.MonkeyPatch) -> None:
    car = vehicle()
    install(monkeypatch, car=car)

    with pytest.raises(NotFoundError):
        ride_service.create(DB, HTTP, clerk_id="user_nobody", payload=payload(car.id))


# --- search --------------------------------------------------------------

MELBOURNE = ZoneInfo("Australia/Melbourne")


def test_the_search_window_is_built_in_melbourne_time(monkeypatch: pytest.MonkeyPatch) -> None:
    """The bug this exists to catch is silent. departure_at is TIMESTAMPTZ and
    the query parameter is a local calendar date, so a window built in UTC
    starts ten hours late: a 9am Melbourne ride falls under the previous day
    and simply does not appear in the results."""
    rides, _ = install(monkeypatch, car=vehicle())

    ride_service.search(DB, origin="clayton", destination="caulfield", on=date(2026, 9, 10))

    assert rides.window == (
        datetime(2026, 9, 10, 0, 0, tzinfo=MELBOURNE),
        datetime(2026, 9, 11, 0, 0, tzinfo=MELBOURNE),
    )


def test_the_window_covers_exactly_one_day(monkeypatch: pytest.MonkeyPatch) -> None:
    """Half-open on purpose: a ride at midnight belongs to one calendar day,
    not two. The repository pairs this with gte/lt."""
    rides, _ = install(monkeypatch, car=vehicle())

    ride_service.search(DB, origin="clayton", destination="caulfield", on=date(2026, 9, 10))

    assert rides.window is not None
    start, end = rides.window
    assert end - start == timedelta(days=1)


def test_the_window_survives_the_start_of_daylight_saving(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Melbourne moves to AEDT on the first Sunday of October, so 4 October
    2026 is a 23-hour day. Adding a day to the aware start is what keeps the
    window on midnight-to-midnight rather than drifting an hour."""
    rides, _ = install(monkeypatch, car=vehicle())

    ride_service.search(DB, origin="clayton", destination="caulfield", on=date(2026, 10, 4))

    assert rides.window is not None
    start, end = rides.window
    assert start.hour == 0
    assert end.hour == 0
    assert end.date() == date(2026, 10, 5)
    # Both ends read midnight, but the offsets differ: the day starts in AEST
    # and finishes in AEDT. Subtracting two datetimes that share a tzinfo
    # object gives wall-clock time, so the real span only shows in UTC - and
    # it is 23 hours, which is correct for this day.
    assert (start.tzname(), end.tzname()) == ("AEST", "AEDT")
    assert end.astimezone(UTC) - start.astimezone(UTC) == timedelta(hours=23)


def test_search_passes_the_campus_filters_through(monkeypatch: pytest.MonkeyPatch) -> None:
    rides, _ = install(monkeypatch, car=vehicle())

    ride_service.search(DB, origin="peninsula", destination="city", on=date(2026, 9, 10))

    assert rides.filters == ("peninsula", "city")


def test_searching_between_the_same_campus_twice_is_refused(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    rides, _ = install(monkeypatch, car=vehicle())

    with pytest.raises(InvalidInputError):
        ride_service.search(DB, origin="clayton", destination="clayton", on=date(2026, 9, 10))

    assert rides.window is None


def test_search_makes_no_route_lookup(monkeypatch: pytest.MonkeyPatch) -> None:
    """Searching reads the database only. A route lookup here would put a
    paid Google call on a path a passenger hits on every filter change."""
    rides, routes = install(monkeypatch, car=vehicle())

    ride_service.search(DB, origin="clayton", destination="caulfield", on=date(2026, 9, 10))

    assert routes.calls == []
    assert rides.window is not None
