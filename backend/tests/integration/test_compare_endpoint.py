"""GET /compare/{ride_id} on the real app.

test_compare_service.py proves the numbers. This proves the wiring it cannot
see: the route mounts at /api/v1, MapsDep injects, the three modes arrive in
one response in the shape the dashboard renders, and a missing ride is a 404
rather than a 500.
"""

from collections.abc import Callable, Iterator
from datetime import UTC, datetime, timedelta
from typing import Any, cast
from uuid import UUID, uuid4

import httpx
import pytest
from fastapi.testclient import TestClient

from app.clients.maps import get_maps_client
from app.core import security
from app.core.config import get_settings
from app.db.client import get_supabase
from app.main import app
from app.schemas.booking import Booking
from app.schemas.enums import Campus, FuelType, TravelMode
from app.schemas.ride import Ride
from app.schemas.route import CampusRoute, TransitLeg
from app.schemas.user import User
from app.schemas.vehicle import Vehicle
from app.services import compare_service
from supabase import Client
from tests.conftest import TEST_ISSUER, fake_settings

COMPARE_URL = "/api/v1/compare"
CLERK_ID = "user_2abc123"

VIEWER = User(
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

CAR = Vehicle(
    id=uuid4(),
    owner_id=uuid4(),
    make="Toyota",
    model="Corolla",
    year=2020,
    fuel_type="petrol",
    fuel_consumption=7.1,
    created_at=datetime.now(UTC),
)

RIDE = Ride(
    id=uuid4(),
    driver_id=CAR.owner_id,
    vehicle_id=CAR.id,
    origin="clayton",
    destination="caulfield",
    departure_at=datetime.now(UTC) + timedelta(days=1),
    total_seats=3,
    available_seats=3,
    distance_km=18.0,
    status="open",
    co2_saved=None,
    points_earned=None,
    created_at=datetime.now(UTC),
)

LEGS = [
    TransitLeg(mode="walk", distance_km=1.229, duration_min=16, line=None),
    TransitLeg(mode="bus", distance_km=5.225, duration_min=12, line="691"),
    TransitLeg(mode="bus", distance_km=21.74, duration_min=59, line="900"),
]


class FakeUserRepo:
    def get_by_clerk_id(self, db: object, clerk_id: str) -> User | None:
        return VIEWER if clerk_id == CLERK_ID else None


class FakeRideRepo:
    def get_ride(self, db: object, ride_id: UUID) -> Ride | None:
        return RIDE if ride_id == RIDE.id else None


class FakeVehicleRepo:
    def get_by_id(self, db: object, vehicle_id: UUID) -> Vehicle | None:
        return CAR if vehicle_id == CAR.id else None


class FakeBookingRepo:
    def count_confirmed(self, db: object, *, ride_id: UUID) -> int:
        return 1

    def get_confirmed(self, db: object, *, ride_id: UUID, passenger_id: UUID) -> Booking | None:
        return None


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
        drive = travel_mode == "drive"
        return CampusRoute(
            id=uuid4(),
            origin=origin,
            destination=destination,
            travel_mode=travel_mode,
            distance_km=23.24 if drive else 28.2,
            duration_min=27 if drive else 87,
            route_summary="Wellington Rd and M1" if drive else "Bus 691 → Bus 900",
            legs=None if drive else LEGS,
            cached_at=datetime.now(UTC),
        )


class FakeFuelService:
    def latest_price(self, db: object, *, fuel_type: FuelType) -> float:
        return 2.159


@pytest.fixture
def wired(monkeypatch: pytest.MonkeyPatch, rsa_keys: tuple[str, str]) -> Iterator[TestClient]:
    _, public_pem = rsa_keys
    settings = fake_settings().model_copy(
        update={"clerk_pem_public_key": public_pem, "clerk_issuer": TEST_ISSUER}
    )
    monkeypatch.setattr(security, "get_settings", lambda: settings)

    monkeypatch.setattr(compare_service, "user_repository", FakeUserRepo())
    monkeypatch.setattr(compare_service, "ride_repository", FakeRideRepo())
    monkeypatch.setattr(compare_service, "vehicle_repository", FakeVehicleRepo())
    monkeypatch.setattr(compare_service, "booking_repository", FakeBookingRepo())
    monkeypatch.setattr(compare_service, "route_service", FakeRouteService())
    monkeypatch.setattr(compare_service, "fuel_service", FakeFuelService())

    app.dependency_overrides[get_settings] = fake_settings
    app.dependency_overrides[get_supabase] = lambda: cast(Client, None)
    app.dependency_overrides[get_maps_client] = lambda: cast(httpx.Client, None)
    yield TestClient(app)
    app.dependency_overrides.clear()


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_all_three_modes_arrive_in_one_response(
    wired: TestClient, make_token: Callable[..., str]
) -> None:
    """REQ-004's shape: carpool, transit and private, side by side, each with
    time, cost and emissions. One request, not three."""
    response = wired.get(f"{COMPARE_URL}/{RIDE.id}", headers=auth(make_token(sub=CLERK_ID)))

    assert response.status_code == 200
    payload = response.json()
    assert [m["mode"] for m in payload["modes"]] == ["carpool", "transit", "private"]
    for row in payload["modes"]:
        assert set(row) == {"mode", "duration_min", "cost", "co2_kg"}


def test_the_numbers_are_the_service_numbers(
    wired: TestClient, make_token: Callable[..., str]
) -> None:
    """One booked plus the viewer: CO2 over three occupants, cost over two
    passengers. Pinned once here so the JSON is known to carry what the
    service computed, not a rounded or renamed copy."""
    payload = wired.get(f"{COMPARE_URL}/{RIDE.id}", headers=auth(make_token(sub=CLERK_ID))).json()
    by_mode: dict[str, dict[str, Any]] = {m["mode"]: m for m in payload["modes"]}

    assert payload["riders"] == 2
    assert by_mode["private"]["co2_kg"] == pytest.approx(2.952, abs=1e-3)
    assert by_mode["carpool"]["co2_kg"] == pytest.approx(2.952 / 3, abs=1e-3)
    assert by_mode["carpool"]["cost"] == pytest.approx(18 * 0.071 * 2.159 / 2, abs=1e-3)
    assert by_mode["transit"]["cost"] == 2.85
    assert by_mode["transit"]["duration_min"] == 87


def test_the_response_carries_its_assumptions_and_the_legs(
    wired: TestClient, make_token: Callable[..., str]
) -> None:
    """The dashboard prints "fuel at $2.16, concession myki" under the table
    and draws the transit journey leg by leg. Both need to be on the wire."""
    payload = wired.get(f"{COMPARE_URL}/{RIDE.id}", headers=auth(make_token(sub=CLERK_ID))).json()

    assert payload["ride_id"] == str(RIDE.id)
    assert payload["is_concession"] is True
    assert payload["fuel_price"] == pytest.approx(2.159)
    assert [leg["mode"] for leg in payload["transit_legs"]] == ["walk", "bus", "bus"]
    assert payload["transit_legs"][1]["line"] == "691"


def test_a_ride_that_does_not_exist_is_404(
    wired: TestClient, make_token: Callable[..., str]
) -> None:
    """NotFoundError from the service, mapped by Sprint 1's handler. Not a 500."""
    response = wired.get(f"{COMPARE_URL}/{uuid4()}", headers=auth(make_token(sub=CLERK_ID)))

    assert response.status_code == 404
    assert response.json()["detail"] == "ride not found"


def test_a_ride_id_that_is_not_a_uuid_is_422(
    wired: TestClient, make_token: Callable[..., str]
) -> None:
    assert (
        wired.get(f"{COMPARE_URL}/banana", headers=auth(make_token(sub=CLERK_ID))).status_code
        == 422
    )


def test_comparing_without_a_token_is_401(wired: TestClient) -> None:
    assert wired.get(f"{COMPARE_URL}/{RIDE.id}").status_code == 401
