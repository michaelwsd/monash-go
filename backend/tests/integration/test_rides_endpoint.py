"""The three /rides endpoints on the real app.

test_ride_service.py already proves the creation logic. This proves the wiring
it cannot see: the router mounts at /api/v1, MapsDep actually injects a client,
PermissionDeniedError surfaces as a 403 rather than a 500, and the schema's
validators fire before any of our code runs.

The status codes are the point. A service test can assert that an error was
raised; only this can assert which number the frontend will have to branch on.

Persistence and Google are both faked. Mocking Supabase to prove we called
Supabase would test nothing, and a test that calls the Routes API is a test
that costs money and fails when the network does.
"""

from collections.abc import Callable, Iterator
from datetime import UTC, datetime, timedelta
from typing import Any, cast
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

import httpx
import pytest
from fastapi.testclient import TestClient

from app.clients.maps import get_maps_client
from app.core import security
from app.core.config import get_settings
from app.db.client import get_supabase
from app.main import app
from app.schemas.enums import Campus, TravelMode
from app.schemas.ride import Ride
from app.schemas.route import CampusRoute
from app.schemas.user import User
from app.schemas.vehicle import Vehicle
from app.services import ride_service
from supabase import Client
from tests.conftest import TEST_ISSUER, fake_settings

MELBOURNE = ZoneInfo("Australia/Melbourne")

RIDES_URL = "/api/v1/rides"
SEARCH_URL = "/api/v1/rides/search"

CLERK_ID = "user_2abc123"
CACHED_DISTANCE_KM = 23.24

OWNER = User(
    id=uuid4(),
    clerk_id=CLERK_ID,
    email="test@student.monash.edu",
    phone="0400000000",
    full_name="Test User",
    role="driver",
    is_concession=True,
    home_campus="clayton",
    green_points=0,
    joined_at=datetime.now(UTC),
)

OWNED_CAR = Vehicle(
    id=uuid4(),
    owner_id=OWNER.id,
    make="Toyota",
    model="Corolla",
    year=2020,
    fuel_type="petrol",
    fuel_consumption=7.1,
    created_at=datetime.now(UTC),
)

SOMEONE_ELSES_CAR = OWNED_CAR.model_copy(update={"id": uuid4(), "owner_id": uuid4()})


def tomorrow_at_nine() -> str:
    """An aware departure, as the frontend would send it. Melbourne is +10:00
    in September, so this also exercises a non-UTC offset surviving the trip."""
    day = (datetime.now(UTC) + timedelta(days=1)).date()
    return f"{day.isoformat()}T09:00:00+10:00"


def body(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "vehicle_id": str(OWNED_CAR.id),
        "origin": "clayton",
        "destination": "caulfield",
        "departure_at": tomorrow_at_nine(),
        "total_seats": 3,
    }
    payload.update(overrides)
    return payload


class FakeUserRepo:
    def get_by_clerk_id(self, db: object, clerk_id: str) -> User | None:
        return OWNER if clerk_id == CLERK_ID else None

    def get_by_id(self, db: object, user_id: UUID) -> User | None:
        return OWNER if user_id == OWNER.id else None


class FakeVehicleRepo:
    def __init__(self) -> None:
        self.rows = {car.id: car for car in (OWNED_CAR, SOMEONE_ELSES_CAR)}

    def get_by_id(self, db: object, vehicle_id: UUID) -> Vehicle | None:
        return self.rows.get(vehicle_id)


class FakeRideRepo:
    def __init__(self) -> None:
        self.rows: list[Ride] = []

    def search(
        self,
        db: object,
        *,
        origin: Campus,
        destination: Campus,
        window_start: datetime,
        window_end: datetime,
    ) -> list[Ride]:
        """Filters in memory the way the real query filters in Postgres, so a
        seat count or a status the endpoint should hide is actually hidden."""
        return [
            ride
            for ride in self.rows
            if ride.origin == origin
            and ride.destination == destination
            and ride.status == "open"
            and ride.available_seats > 0
            and window_start <= ride.departure_at < window_end
        ]

    def get_ride(self, db: object, ride_id: UUID) -> Ride | None:
        return next((ride for ride in self.rows if ride.id == ride_id), None)

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
    def get_route(
        self,
        db: object,
        http: object,
        *,
        origin: Campus,
        destination: Campus,
        travel_mode: TravelMode,
    ) -> CampusRoute:
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


class FakeRouteRepo:
    """The cached drive row the detail view reads. Set `row` to None to stand
    for a cache miss, which must not be an error on a page view."""

    def __init__(self) -> None:
        self.row: CampusRoute | None = CampusRoute(
            id=uuid4(),
            origin="clayton",
            destination="caulfield",
            travel_mode="drive",
            distance_km=CACHED_DISTANCE_KM,
            duration_min=27,
            route_summary="Wellington Rd and M1",
            legs=None,
            cached_at=datetime.now(UTC),
        )

    def get(
        self, db: object, *, origin: Campus, destination: Campus, travel_mode: TravelMode
    ) -> CampusRoute | None:
        return self.row


@pytest.fixture
def wired(
    monkeypatch: pytest.MonkeyPatch, rsa_keys: tuple[str, str]
) -> Iterator[tuple[TestClient, FakeRideRepo, FakeRouteRepo]]:
    """The real app with real routing and real auth, over in-memory storage."""
    _, public_pem = rsa_keys
    settings = fake_settings().model_copy(
        update={"clerk_pem_public_key": public_pem, "clerk_issuer": TEST_ISSUER}
    )
    monkeypatch.setattr(security, "get_settings", lambda: settings)

    rides, routes = FakeRideRepo(), FakeRouteRepo()
    monkeypatch.setattr(ride_service, "user_repository", FakeUserRepo())
    monkeypatch.setattr(ride_service, "vehicle_repository", FakeVehicleRepo())
    monkeypatch.setattr(ride_service, "ride_repository", rides)
    monkeypatch.setattr(ride_service, "route_service", FakeRouteService())
    monkeypatch.setattr(ride_service, "route_repository", routes)

    app.dependency_overrides[get_settings] = fake_settings
    # the fakes never touch either, so there is nothing real to build
    app.dependency_overrides[get_supabase] = lambda: cast(Client, None)
    app.dependency_overrides[get_maps_client] = lambda: cast(httpx.Client, None)
    yield TestClient(app), rides, routes
    app.dependency_overrides.clear()


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# --- the happy path ------------------------------------------------------


def test_posting_a_ride_returns_201_and_the_stored_row(
    wired: tuple[TestClient, FakeRideRepo, FakeRouteRepo], make_token: Callable[..., str]
) -> None:
    client, rides, _ = wired

    response = client.post(RIDES_URL, json=body(), headers=auth(make_token(sub=CLERK_ID)))

    assert response.status_code == 201
    payload = response.json()
    assert payload["driver_id"] == str(OWNER.id)
    assert payload["vehicle_id"] == str(OWNED_CAR.id)
    assert payload["status"] == "open"
    assert len(rides.rows) == 1


def test_a_new_ride_opens_with_every_seat_free(
    wired: tuple[TestClient, FakeRideRepo, FakeRouteRepo], make_token: Callable[..., str]
) -> None:
    client, _, _ = wired

    payload = client.post(
        RIDES_URL, json=body(total_seats=4), headers=auth(make_token(sub=CLERK_ID))
    ).json()

    assert payload["total_seats"] == 4
    assert payload["available_seats"] == 4


def test_the_response_carries_the_cached_distance(
    wired: tuple[TestClient, FakeRideRepo, FakeRouteRepo], make_token: Callable[..., str]
) -> None:
    """distance_km is never sent by the client. The frontend needs it back,
    since it is what every emissions and cost figure is built from."""
    client, _, _ = wired

    payload = client.post(RIDES_URL, json=body(), headers=auth(make_token(sub=CLERK_ID))).json()

    assert payload["distance_km"] == CACHED_DISTANCE_KM


def test_a_melbourne_departure_survives_the_round_trip(
    wired: tuple[TestClient, FakeRideRepo, FakeRouteRepo], make_token: Callable[..., str]
) -> None:
    """09:00+10:00 is 23:00Z the day before. The moment must be preserved, in
    whatever timezone it comes back."""
    client, rides, _ = wired
    sent = tomorrow_at_nine()

    response = client.post(
        RIDES_URL, json=body(departure_at=sent), headers=auth(make_token(sub=CLERK_ID))
    )

    assert response.status_code == 201
    assert rides.rows[0].departure_at == datetime.fromisoformat(sent)


# --- refusals ------------------------------------------------------------


def test_no_token_is_401_and_writes_nothing(
    wired: tuple[TestClient, FakeRideRepo, FakeRouteRepo],
) -> None:
    client, rides, _ = wired

    response = client.post(RIDES_URL, json=body())

    assert response.status_code == 401
    assert rides.rows == []


def test_someone_elses_vehicle_is_403_and_writes_nothing(
    wired: tuple[TestClient, FakeRideRepo, FakeRouteRepo], make_token: Callable[..., str]
) -> None:
    """PermissionDeniedError has to reach the client as a 403. Uncaught it
    would be a 500, and the frontend cannot tell 'not yours' from 'we broke'."""
    client, rides, _ = wired

    response = client.post(
        RIDES_URL,
        json=body(vehicle_id=str(SOMEONE_ELSES_CAR.id)),
        headers=auth(make_token(sub=CLERK_ID)),
    )

    assert response.status_code == 403
    assert rides.rows == []


def test_a_vehicle_that_does_not_exist_is_404(
    wired: tuple[TestClient, FakeRideRepo, FakeRouteRepo], make_token: Callable[..., str]
) -> None:
    client, rides, _ = wired

    response = client.post(
        RIDES_URL, json=body(vehicle_id=str(uuid4())), headers=auth(make_token(sub=CLERK_ID))
    )

    assert response.status_code == 404
    assert rides.rows == []


def test_a_departure_in_the_past_is_400(
    wired: tuple[TestClient, FakeRideRepo, FakeRouteRepo], make_token: Callable[..., str]
) -> None:
    """Well-formed but against the rules, so it is the service's 400 rather
    than the schema's 422."""
    client, rides, _ = wired
    yesterday = (datetime.now(UTC) - timedelta(days=1)).isoformat()

    response = client.post(
        RIDES_URL, json=body(departure_at=yesterday), headers=auth(make_token(sub=CLERK_ID))
    )

    assert response.status_code == 400
    assert rides.rows == []


# --- the schema's own refusals, all 422 ----------------------------------


@pytest.mark.parametrize(
    ("label", "overrides"),
    [
        ("same campus twice", {"origin": "clayton", "destination": "clayton"}),
        ("no timezone offset", {"departure_at": "2027-01-10T09:00:00"}),
        ("zero seats", {"total_seats": 0}),
        ("more seats than a car has", {"total_seats": 9}),
        ("an unknown campus", {"origin": "footscray"}),
        ("a vehicle_id that is not a uuid", {"vehicle_id": "not-a-uuid"}),
        ("distance_km, which callers may not set", {"distance_km": 5.0}),
    ],
)
def test_a_malformed_body_is_422(
    wired: tuple[TestClient, FakeRideRepo, FakeRouteRepo],
    make_token: Callable[..., str],
    label: str,
    overrides: dict[str, Any],
) -> None:
    """Every one of these is caught by RideCreate before a line of our code
    runs. The last is the important one: extra='forbid' is what stops a driver
    smuggling in their own distance."""
    client, rides, _ = wired

    response = client.post(
        RIDES_URL, json=body(**overrides), headers=auth(make_token(sub=CLERK_ID))
    )

    assert response.status_code == 422, label
    assert rides.rows == []


def test_a_missing_field_is_422(
    wired: tuple[TestClient, FakeRideRepo, FakeRouteRepo], make_token: Callable[..., str]
) -> None:
    client, rides, _ = wired
    incomplete = body()
    del incomplete["total_seats"]

    response = client.post(RIDES_URL, json=incomplete, headers=auth(make_token(sub=CLERK_ID)))

    assert response.status_code == 422
    assert rides.rows == []


# --- GET /rides/search ---------------------------------------------------


def post_a_ride(client: TestClient, token: str, **overrides: Any) -> dict[str, Any]:
    response = client.post(RIDES_URL, json=body(**overrides), headers=auth(token))
    assert response.status_code == 201
    return cast(dict[str, Any], response.json())


def melbourne_date_of(iso: str) -> str:
    """The calendar date a departure falls on in Melbourne, which is the date
    a passenger would type into the search form."""
    return datetime.fromisoformat(iso).astimezone(MELBOURNE).date().isoformat()


def test_a_posted_ride_is_findable_on_its_melbourne_date(
    wired: tuple[TestClient, FakeRideRepo, FakeRouteRepo], make_token: Callable[..., str]
) -> None:
    """The round trip the frontend actually performs: post a ride, then find
    it by the date a person would type. A window built in UTC starts ten hours
    late and this comes back empty."""
    client, _, _ = wired
    token = make_token(sub=CLERK_ID)
    departure = tomorrow_at_nine()
    created = post_a_ride(client, token, departure_at=departure)

    response = client.get(
        SEARCH_URL,
        params={
            "origin": "clayton",
            "destination": "caulfield",
            "on": melbourne_date_of(departure),
        },
        headers=auth(token),
    )

    assert response.status_code == 200
    assert [ride["id"] for ride in response.json()] == [created["id"]]


def test_a_day_with_no_rides_is_an_empty_list_not_an_error(
    wired: tuple[TestClient, FakeRideRepo, FakeRouteRepo], make_token: Callable[..., str]
) -> None:
    client, _, _ = wired
    token = make_token(sub=CLERK_ID)
    post_a_ride(client, token)

    response = client.get(
        SEARCH_URL,
        params={"origin": "clayton", "destination": "caulfield", "on": "2027-01-01"},
        headers=auth(token),
    )

    assert response.status_code == 200
    assert response.json() == []


def test_search_does_not_return_rides_on_a_different_route(
    wired: tuple[TestClient, FakeRideRepo, FakeRouteRepo], make_token: Callable[..., str]
) -> None:
    """Routes are directional. A Clayton to Caulfield ride is not a result for
    someone travelling the other way."""
    client, _, _ = wired
    token = make_token(sub=CLERK_ID)
    departure = tomorrow_at_nine()
    post_a_ride(client, token, departure_at=departure)

    response = client.get(
        SEARCH_URL,
        params={
            "origin": "caulfield",
            "destination": "clayton",
            "on": melbourne_date_of(departure),
        },
        headers=auth(token),
    )

    assert response.json() == []


def test_a_full_ride_is_not_a_search_result(
    wired: tuple[TestClient, FakeRideRepo, FakeRouteRepo], make_token: Callable[..., str]
) -> None:
    """available_seats > 0 is the filter a passenger depends on: a ride they
    cannot book is worse than no ride at all."""
    client, rides, _ = wired
    token = make_token(sub=CLERK_ID)
    departure = tomorrow_at_nine()
    post_a_ride(client, token, departure_at=departure)
    rides.rows[0] = rides.rows[0].model_copy(update={"available_seats": 0})

    response = client.get(
        SEARCH_URL,
        params={
            "origin": "clayton",
            "destination": "caulfield",
            "on": melbourne_date_of(departure),
        },
        headers=auth(token),
    )

    assert response.json() == []


def test_a_cancelled_ride_is_not_a_search_result(
    wired: tuple[TestClient, FakeRideRepo, FakeRouteRepo], make_token: Callable[..., str]
) -> None:
    """Seats free and still not bookable, which is why status is filtered
    alongside the seat count rather than instead of it."""
    client, rides, _ = wired
    token = make_token(sub=CLERK_ID)
    departure = tomorrow_at_nine()
    post_a_ride(client, token, departure_at=departure)
    rides.rows[0] = rides.rows[0].model_copy(update={"status": "cancelled"})

    response = client.get(
        SEARCH_URL,
        params={
            "origin": "clayton",
            "destination": "caulfield",
            "on": melbourne_date_of(departure),
        },
        headers=auth(token),
    )

    assert response.json() == []


def test_search_without_a_token_is_401(
    wired: tuple[TestClient, FakeRideRepo, FakeRouteRepo],
) -> None:
    client, _, _ = wired

    response = client.get(
        SEARCH_URL,
        params={"origin": "clayton", "destination": "caulfield", "on": "2026-09-10"},
    )

    assert response.status_code == 401


@pytest.mark.parametrize(
    ("label", "params"),
    [
        ("a date that is not a date", {"origin": "clayton", "destination": "city", "on": "soon"}),
        ("an unknown campus", {"origin": "footscray", "destination": "city", "on": "2026-09-10"}),
        ("no date at all", {"origin": "clayton", "destination": "city"}),
        ("no destination", {"origin": "clayton", "on": "2026-09-10"}),
    ],
)
def test_a_malformed_search_is_422(
    wired: tuple[TestClient, FakeRideRepo, FakeRouteRepo],
    make_token: Callable[..., str],
    label: str,
    params: dict[str, str],
) -> None:
    client, _, _ = wired

    response = client.get(SEARCH_URL, params=params, headers=auth(make_token(sub=CLERK_ID)))

    assert response.status_code == 422, label


def test_searching_between_the_same_campus_twice_is_400(
    wired: tuple[TestClient, FakeRideRepo, FakeRouteRepo], make_token: Callable[..., str]
) -> None:
    """Well-formed but pointless, so it is the service's 400 rather than a 422."""
    client, _, _ = wired

    response = client.get(
        SEARCH_URL,
        params={"origin": "clayton", "destination": "clayton", "on": "2026-09-10"},
        headers=auth(make_token(sub=CLERK_ID)),
    )

    assert response.status_code == 400


def test_the_search_path_is_not_swallowed_by_the_detail_route(
    wired: tuple[TestClient, FakeRideRepo, FakeRouteRepo], make_token: Callable[..., str]
) -> None:
    """/rides/search and /rides/{ride_id} share a shape. FastAPI matches in
    declaration order, so if the detail route is ever registered first this
    becomes a 422 complaining that 'search' is not a UUID."""
    client, _, _ = wired

    response = client.get(
        SEARCH_URL,
        params={"origin": "clayton", "destination": "caulfield", "on": "2026-09-10"},
        headers=auth(make_token(sub=CLERK_ID)),
    )

    assert response.status_code == 200


# --- GET /rides/{ride_id} ------------------------------------------------


def detail_of(client: TestClient, token: str, ride_id: str) -> httpx.Response:
    return client.get(f"{RIDES_URL}/{ride_id}", headers=auth(token))


def test_detail_resolves_the_driver_and_the_car(
    wired: tuple[TestClient, FakeRideRepo, FakeRouteRepo], make_token: Callable[..., str]
) -> None:
    """Search returns driver_id and vehicle_id, which mean nothing to a person.
    This is where they become a name and a car, so a passenger can decide
    whether to get in."""
    client, _, _ = wired
    token = make_token(sub=CLERK_ID)
    created = post_a_ride(client, token)

    response = detail_of(client, token, created["id"])

    assert response.status_code == 200
    payload = response.json()
    assert payload["driver"]["full_name"] == OWNER.full_name
    assert payload["vehicle"]["make"] == OWNED_CAR.make
    assert payload["vehicle"]["model"] == OWNED_CAR.model


def test_detail_never_reveals_the_drivers_phone(
    wired: tuple[TestClient, FakeRideRepo, FakeRouteRepo], make_token: Callable[..., str]
) -> None:
    """CLAUDE.md: phone numbers are revealed only after a booking is confirmed.
    RideDriver carries a name and nothing else, so the number cannot leak by
    someone later adding a field to User."""
    client, _, _ = wired
    token = make_token(sub=CLERK_ID)
    created = post_a_ride(client, token)

    payload = detail_of(client, token, created["id"]).json()

    assert "phone" not in payload["driver"]
    assert "email" not in payload["driver"]
    assert OWNER.phone not in response_text(payload)


def response_text(payload: dict[str, Any]) -> str:
    """The whole body as one string, so a leaked field anywhere in the tree is
    caught rather than only the one key a test thought to check."""
    return str(payload)


def test_detail_carries_the_cached_drive_summary(
    wired: tuple[TestClient, FakeRideRepo, FakeRouteRepo], make_token: Callable[..., str]
) -> None:
    """A ride is somebody driving, so the route shown is the drive row. The
    transit alternative belongs to the comparison dashboard in Sprint 5."""
    client, _, _ = wired
    token = make_token(sub=CLERK_ID)
    created = post_a_ride(client, token)

    payload = detail_of(client, token, created["id"]).json()

    assert payload["route_summary"] == "Wellington Rd and M1"


def test_a_cache_miss_leaves_the_summary_blank_rather_than_failing(
    wired: tuple[TestClient, FakeRideRepo, FakeRouteRepo], make_token: Callable[..., str]
) -> None:
    """The detail view reads the route repository directly, not route_service,
    so an uncached pair yields no summary instead of a paid Google call on a
    page view. The ride is still perfectly viewable without it."""
    client, _, routes = wired
    token = make_token(sub=CLERK_ID)
    created = post_a_ride(client, token)
    routes.row = None

    response = detail_of(client, token, created["id"])

    assert response.status_code == 200
    assert response.json()["route_summary"] is None


def test_detail_still_carries_the_ride_fields_search_returned(
    wired: tuple[TestClient, FakeRideRepo, FakeRouteRepo], make_token: Callable[..., str]
) -> None:
    """RideDetail extends RideResponse, so opening a card must not lose the
    seat count or the distance the list already showed."""
    client, _, _ = wired
    token = make_token(sub=CLERK_ID)
    created = post_a_ride(client, token, total_seats=4)

    payload = detail_of(client, token, created["id"]).json()

    assert payload["id"] == created["id"]
    assert payload["available_seats"] == 4
    assert payload["distance_km"] == CACHED_DISTANCE_KM
    assert payload["status"] == "open"


def test_a_ride_that_does_not_exist_is_404(
    wired: tuple[TestClient, FakeRideRepo, FakeRouteRepo], make_token: Callable[..., str]
) -> None:
    client, _, _ = wired

    response = detail_of(client, make_token(sub=CLERK_ID), str(uuid4()))

    assert response.status_code == 404


def test_a_ride_id_that_is_not_a_uuid_is_422(
    wired: tuple[TestClient, FakeRideRepo, FakeRouteRepo], make_token: Callable[..., str]
) -> None:
    """Declaring the path parameter as UUID is what keeps a malformed id from
    reaching Postgres and coming back as a database error."""
    client, _, _ = wired

    response = detail_of(client, make_token(sub=CLERK_ID), "banana")

    assert response.status_code == 422


def test_detail_without_a_token_is_401(
    wired: tuple[TestClient, FakeRideRepo, FakeRouteRepo], make_token: Callable[..., str]
) -> None:
    client, _, _ = wired
    created = post_a_ride(client, make_token(sub=CLERK_ID))

    response = client.get(f"{RIDES_URL}/{created['id']}")

    assert response.status_code == 401
