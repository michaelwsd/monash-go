"""PATCH /rides/{id}/complete and GET /rewards/me on the real app.

test_rewards_service.py proves the payout rules. This proves the wiring: the
routes mount, a non-driver is refused with 403 rather than 500, a second
completion answers 200 rather than erroring, and the impact figures REQ-013
asks for arrive in one response.
"""

from collections.abc import Callable, Iterator
from datetime import UTC, datetime, timedelta
from typing import cast
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app.core import security
from app.core.config import get_settings
from app.db.client import get_supabase
from app.main import app
from app.schemas.booking import Booking
from app.schemas.enums import PetStage
from app.schemas.rewards import Rewards
from app.schemas.ride import Ride
from app.schemas.user import User
from app.schemas.vehicle import Vehicle
from app.services import rewards_service
from supabase import Client
from tests.conftest import TEST_ISSUER, fake_settings

RIDES_URL = "/api/v1/rides"
REWARDS_URL = "/api/v1/rewards/me"
CLERK_ID = "user_2abc123"

DRIVER = User(
    id=uuid4(),
    clerk_id=CLERK_ID,
    email="test@student.monash.edu",
    phone="0400000000",
    full_name="Dana Driver",
    role="driver",
    is_concession=True,
    home_campus="clayton",
    green_points=0,
    joined_at=datetime.now(UTC),
)
PASSENGER = DRIVER.model_copy(
    update={"id": uuid4(), "clerk_id": "user_passenger", "full_name": "Pat Passenger"}
)

CAR = Vehicle(
    id=uuid4(),
    owner_id=DRIVER.id,
    make="Toyota",
    model="Corolla",
    year=2020,
    fuel_type="petrol",
    fuel_consumption=7.1,
    created_at=datetime.now(UTC),
)

RIDE = Ride(
    id=uuid4(),
    driver_id=DRIVER.id,
    vehicle_id=CAR.id,
    origin="clayton",
    destination="caulfield",
    departure_at=datetime.now(UTC) - timedelta(hours=2),
    total_seats=3,
    available_seats=2,
    distance_km=18.0,
    status="open",
    co2_saved=None,
    points_earned=None,
    created_at=datetime.now(UTC),
)


class State:
    """One ride and one rewards row, shared by every fake - as a database is."""

    def __init__(self) -> None:
        self.ride = RIDE
        self.total = 0.0
        self.stage: PetStage = "egg"
        self.points = 0


class FakeUserRepo:
    def __init__(self, state: State) -> None:
        self.state = state

    def get_by_clerk_id(self, db: object, clerk_id: str) -> User | None:
        if clerk_id == CLERK_ID:
            return DRIVER.model_copy(update={"green_points": self.state.points})
        return PASSENGER if clerk_id == PASSENGER.clerk_id else None

    def get_by_id(self, db: object, user_id: UUID) -> User | None:
        return next((u for u in (DRIVER, PASSENGER) if u.id == user_id), None)


class FakeRideRepo:
    def __init__(self, state: State) -> None:
        self.state = state

    def get_ride(self, db: object, ride_id: UUID) -> Ride | None:
        return self.state.ride if ride_id == self.state.ride.id else None

    def count_completed_for_user(self, db: object, *, user_id: UUID) -> int:
        return 1 if self.state.ride.status == "completed" else 0


class FakeVehicleRepo:
    def get_by_id(self, db: object, vehicle_id: UUID) -> Vehicle | None:
        return CAR if vehicle_id == CAR.id else None


class FakeBookingRepo:
    def __init__(self, state: State) -> None:
        self.state = state
        self.bookings = [
            Booking(
                id=uuid4(),
                ride_id=RIDE.id,
                passenger_id=PASSENGER.id,
                status="confirmed",
                created_at=datetime.now(UTC),
            )
        ]

    def list_confirmed_for_ride(self, db: object, *, ride_id: UUID) -> list[Booking]:
        return [b for b in self.bookings if b.status == "confirmed"]

    def count_completed_for_passenger(self, db: object, *, passenger_id: UUID) -> int:
        return len([b for b in self.bookings if b.status == "completed"])


class FakeRewardsRepo:
    def __init__(self, state: State, bookings: FakeBookingRepo) -> None:
        self.state = state
        self.bookings = bookings
        self.payouts = 0

    def complete_ride(
        self, db: object, *, ride_id: UUID, driver_id: UUID, co2_saved: float, points: int
    ) -> tuple[str, int]:
        if self.state.ride.co2_saved is not None:
            return "already_completed", 0
        self.payouts += 1
        self.state.ride = self.state.ride.model_copy(
            update={"status": "completed", "co2_saved": co2_saved, "points_earned": points}
        )
        self.state.total += co2_saved
        self.state.points += points
        riders = len(self.bookings.list_confirmed_for_ride(db, ride_id=ride_id))
        self.bookings.bookings = [
            b.model_copy(update={"status": "completed"}) for b in self.bookings.bookings
        ]
        return "completed", riders

    def get(self, db: object, *, user_id: UUID) -> Rewards:
        return Rewards(
            id=uuid4(),
            user_id=user_id,
            pet_stage=self.state.stage,
            total_co2_saved=self.state.total,
            milestone=0,
        )

    def set_stage(self, db: object, *, user_id: UUID, pet_stage: PetStage) -> None:
        self.state.stage = pet_stage


@pytest.fixture
def wired(
    monkeypatch: pytest.MonkeyPatch, rsa_keys: tuple[str, str]
) -> Iterator[tuple[TestClient, State, FakeRewardsRepo]]:
    _, public_pem = rsa_keys
    settings = fake_settings().model_copy(
        update={"clerk_pem_public_key": public_pem, "clerk_issuer": TEST_ISSUER}
    )
    monkeypatch.setattr(security, "get_settings", lambda: settings)

    state = State()
    bookings = FakeBookingRepo(state)
    rewards = FakeRewardsRepo(state, bookings)
    monkeypatch.setattr(rewards_service, "user_repository", FakeUserRepo(state))
    monkeypatch.setattr(rewards_service, "ride_repository", FakeRideRepo(state))
    monkeypatch.setattr(rewards_service, "vehicle_repository", FakeVehicleRepo())
    monkeypatch.setattr(rewards_service, "booking_repository", bookings)
    monkeypatch.setattr(rewards_service, "rewards_repository", rewards)

    app.dependency_overrides[get_settings] = fake_settings
    app.dependency_overrides[get_supabase] = lambda: cast(Client, None)
    yield TestClient(app), state, rewards
    app.dependency_overrides.clear()


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def complete(client: TestClient, token: str, ride_id: UUID | None = None) -> object:
    return client.patch(f"{RIDES_URL}/{ride_id or RIDE.id}/complete", headers=auth(token))


# --- completing ----------------------------------------------------------


def test_completing_returns_what_it_awarded(
    wired: tuple[TestClient, State, FakeRewardsRepo], make_token: Callable[..., str]
) -> None:
    """changes.md 1.5: a Corolla over 18 km with one passenger. The figures the
    screen shows come straight from the response, not from the frontend."""
    client, _, _ = wired

    response = complete(client, make_token(sub=CLERK_ID))

    assert response.status_code == 200  # type: ignore[attr-defined]
    payload = response.json()  # type: ignore[attr-defined]
    assert payload["co2_saved"] > 0
    assert payload["points_earned"] == int(payload["co2_saved"] * 100)
    assert payload["passengers"] == 1
    assert payload["already_completed"] is False


def test_completing_twice_is_200_and_pays_once(
    wired: tuple[TestClient, State, FakeRewardsRepo], make_token: Callable[..., str]
) -> None:
    """A driver tapping twice has done nothing wrong, so it is not an error -
    but the payout must happen exactly once."""
    client, _, rewards = wired
    token = make_token(sub=CLERK_ID)

    first = complete(client, token).json()  # type: ignore[attr-defined]
    second = complete(client, token)

    assert second.status_code == 200  # type: ignore[attr-defined]
    assert second.json()["already_completed"] is True  # type: ignore[attr-defined]
    assert second.json()["points_earned"] == first["points_earned"]  # type: ignore[attr-defined]
    assert rewards.payouts == 1


def test_a_passenger_cannot_complete_the_ride(
    wired: tuple[TestClient, State, FakeRewardsRepo], make_token: Callable[..., str]
) -> None:
    """403, not 404: the ride is real and they can see it. They just were not
    driving, and completing it would award themselves points."""
    client, _, rewards = wired

    response = complete(client, make_token(sub=PASSENGER.clerk_id))

    assert response.status_code == 403  # type: ignore[attr-defined]
    assert rewards.payouts == 0


def test_completing_a_ride_that_does_not_exist_is_404(
    wired: tuple[TestClient, State, FakeRewardsRepo], make_token: Callable[..., str]
) -> None:
    client, _, _ = wired

    assert complete(client, make_token(sub=CLERK_ID), uuid4()).status_code == 404  # type: ignore[attr-defined]


def test_completing_without_a_token_is_401(
    wired: tuple[TestClient, State, FakeRewardsRepo],
) -> None:
    client, _, _ = wired

    assert client.patch(f"{RIDES_URL}/{RIDE.id}/complete").status_code == 401


# --- GET /rewards/me -----------------------------------------------------


def test_a_fresh_account_has_a_zero_state(
    wired: tuple[TestClient, State, FakeRewardsRepo], make_token: Callable[..., str]
) -> None:
    """REQ-013 names the zero-state explicitly. Zeroes, an egg, and a real
    target to aim at - not nulls the UI has to guess about."""
    client, _, _ = wired

    payload = client.get(REWARDS_URL, headers=auth(make_token(sub=CLERK_ID))).json()

    assert payload["total_co2_saved"] == 0
    assert payload["green_points"] == 0
    assert payload["completed_trips"] == 0
    assert payload["pet_stage"] == "egg"
    assert payload["next_stage"] == "hatched"
    assert payload["co2_to_next"] == 15.0


def test_the_summary_reflects_a_completed_trip(
    wired: tuple[TestClient, State, FakeRewardsRepo], make_token: Callable[..., str]
) -> None:
    """REQ-006: the balance updates in the database and the UI reads it here."""
    client, _, _ = wired
    token = make_token(sub=CLERK_ID)
    awarded = complete(client, token).json()  # type: ignore[attr-defined]

    payload = client.get(REWARDS_URL, headers=auth(token)).json()

    assert payload["total_co2_saved"] == pytest.approx(awarded["co2_saved"])
    assert payload["green_points"] == awarded["points_earned"]
    assert payload["completed_trips"] == 2  # one as driver, one as passenger fake
    assert payload["co2_to_next"] < 15.0


def test_the_progress_bar_has_something_to_show(
    wired: tuple[TestClient, State, FakeRewardsRepo], make_token: Callable[..., str]
) -> None:
    client, state, _ = wired
    state.total = 7.5  # half way to hatching

    payload = client.get(REWARDS_URL, headers=auth(make_token(sub=CLERK_ID))).json()

    assert payload["stage_progress"] == pytest.approx(50.0, abs=1e-6)
    assert payload["co2_to_next"] == pytest.approx(7.5)


def test_a_fully_grown_pet_has_no_next_stage(
    wired: tuple[TestClient, State, FakeRewardsRepo], make_token: Callable[..., str]
) -> None:
    """At legendary there is nothing above, so the UI shows a full bar rather
    than a target nobody can reach."""
    client, state, _ = wired
    state.total = 900.0

    payload = client.get(REWARDS_URL, headers=auth(make_token(sub=CLERK_ID))).json()

    assert payload["pet_stage"] == "legendary"
    assert payload["next_stage"] is None
    assert payload["co2_to_next"] is None
    assert payload["stage_progress"] == 100.0


def test_rewards_without_a_token_is_401(
    wired: tuple[TestClient, State, FakeRewardsRepo],
) -> None:
    client, _, _ = wired

    assert client.get(REWARDS_URL).status_code == 401
