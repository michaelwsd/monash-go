"""Completing a ride and paying out for it, against in-memory fakes.

Points are currency, so the tests that matter are the ones about *not* paying
twice and about paying the right people. The arithmetic itself is Sprint 2's
and is already tested on plain floats in test_emissions.py and test_points.py;
the figures below are lifted from docs/changes.md 1.5 rather than re-derived,
so if one of them and the doc disagree, one of them is a bug.

The atomic write lives in supabase/migrations/0004_complete_ride.sql and is
proved against real Postgres; FakeRewardsRepo stands in for it here, modelling
only what the service can observe: a result word, and a count.
"""

from datetime import UTC, datetime, timedelta
from typing import Any, cast
from uuid import UUID, uuid4

import pytest

from app.exceptions.errors import InvalidInputError, NotFoundError, PermissionDeniedError
from app.schemas.booking import Booking
from app.schemas.enums import BookingStatus, FuelType, PetStage
from app.schemas.rewards import Rewards
from app.schemas.ride import Ride
from app.schemas.user import User
from app.schemas.vehicle import Vehicle
from app.services import rewards_service
from supabase import Client

DB = cast(Client, None)

# changes.md 1.5: a Toyota Corolla 2020 at 7.1 L/100km over 18 km.
DISTANCE_KM = 18.0
CONSUMPTION = 7.1
# Two passengers avoid 7.26 kg, which is 726 points - the row in that table.
CO2_TWO_PASSENGERS = 7.26264
POINTS_TWO_PASSENGERS = 726

DRIVER = User(
    id=uuid4(),
    clerk_id="user_driver",
    email="d@student.monash.edu",
    phone="0400000000",
    full_name="Dana Driver",
    role="driver",
    is_concession=True,
    home_campus="clayton",
    green_points=0,
    joined_at=datetime.now(UTC),
)
PASSENGER = DRIVER.model_copy(
    update={
        "id": uuid4(),
        "clerk_id": "user_pass",
        "full_name": "Pat Passenger",
        "role": "passenger",
    }
)


def vehicle(fuel_type: FuelType = "petrol", consumption: float = CONSUMPTION) -> Vehicle:
    return Vehicle(
        id=uuid4(),
        owner_id=DRIVER.id,
        make="Toyota",
        model="Corolla",
        year=2020,
        fuel_type=fuel_type,
        fuel_consumption=consumption,
        created_at=datetime.now(UTC),
    )


def ride(car: Vehicle, *, departed: bool = True) -> Ride:
    offset = timedelta(hours=-2) if departed else timedelta(days=1)
    return Ride(
        id=uuid4(),
        driver_id=DRIVER.id,
        vehicle_id=car.id,
        origin="clayton",
        destination="caulfield",
        departure_at=datetime.now(UTC) + offset,
        total_seats=3,
        available_seats=1,
        distance_km=DISTANCE_KM,
        status="open",
        co2_saved=None,
        points_earned=None,
        created_at=datetime.now(UTC),
    )


def booking(ride_id: UUID, passenger_id: UUID, status: BookingStatus = "confirmed") -> Booking:
    return Booking(
        id=uuid4(),
        ride_id=ride_id,
        passenger_id=passenger_id,
        status=status,
        created_at=datetime.now(UTC),
    )


class FakeUserRepo:
    def __init__(self) -> None:
        self.rows = {u.clerk_id: u for u in (DRIVER, PASSENGER)}

    def get_by_clerk_id(self, db: object, clerk_id: str) -> User | None:
        return self.rows.get(clerk_id)

    def get_by_id(self, db: object, user_id: UUID) -> User | None:
        return next((u for u in self.rows.values() if u.id == user_id), None)


class Rides:
    """One mutable ride, shared by the ride and rewards fakes.

    They have to see the same row. The service re-reads the ride after losing a
    race, to find out what was actually paid, and two independent copies would
    hide the very bug this models.
    """

    def __init__(self, row: Ride) -> None:
        self.row = row


class FakeRideRepo:
    def __init__(self, rides: Rides) -> None:
        self.rides = rides

    def get_ride(self, db: object, ride_id: UUID) -> Ride | None:
        return self.rides.row if self.rides.row.id == ride_id else None

    def count_completed_for_user(self, db: object, *, user_id: UUID) -> int:
        row = self.rides.row
        return 1 if row.status == "completed" and row.driver_id == user_id else 0


class FakeVehicleRepo:
    def __init__(self, row: Vehicle) -> None:
        self.row = row

    def get_by_id(self, db: object, vehicle_id: UUID) -> Vehicle | None:
        return self.row if self.row.id == vehicle_id else None


class FakeBookingRepo:
    def __init__(self, rows: list[Booking] | None = None) -> None:
        self.rows = rows or []

    def list_confirmed_for_ride(self, db: object, *, ride_id: UUID) -> list[Booking]:
        return [b for b in self.rows if b.ride_id == ride_id and b.status == "confirmed"]

    def count_completed_for_passenger(self, db: object, *, passenger_id: UUID) -> int:
        return len(
            [b for b in self.rows if b.passenger_id == passenger_id and b.status == "completed"]
        )


class FakeRewardsRepo:
    """Stands in for 0004_complete_ride.sql.

    It models the one thing the service depends on: the ride is paid for at
    most once, and the word says which happened. The per-user credit is
    recorded so a test can check who was paid and how much.
    """

    def __init__(self, rides: Rides, bookings: FakeBookingRepo, *, stage: PetStage = "egg") -> None:
        self.rides = rides
        self.bookings = bookings
        self.credited: dict[UUID, float] = {}
        self.points: dict[UUID, int] = {}
        self.stages: dict[UUID, PetStage] = {}
        self.totals: dict[UUID, float] = {}
        self.start_stage = stage
        self.calls = 0

    def complete_ride(
        self, db: object, *, ride_id: UUID, driver_id: UUID, co2_saved: float, points: int
    ) -> tuple[str, int]:
        self.calls += 1
        row = self.rides.row
        if row.id != ride_id:
            return "ride_not_found", 0
        if row.driver_id != driver_id:
            return "not_your_ride", 0
        if row.departure_at > datetime.now(UTC):
            return "not_departed", 0
        if row.co2_saved is not None:
            return "already_completed", 0

        self.rides.row = row.model_copy(
            update={"status": "completed", "co2_saved": co2_saved, "points_earned": points}
        )
        riders = [
            b.passenger_id for b in self.bookings.list_confirmed_for_ride(db, ride_id=ride_id)
        ]
        for uid in [driver_id, *riders]:
            # credited is what THIS payout gave them; totals is the lifetime
            # figure, which a test may have seeded with earlier rides.
            self.credited[uid] = self.credited.get(uid, 0.0) + co2_saved
            self.points[uid] = self.points.get(uid, 0) + points
            self.totals[uid] = self.totals.get(uid, 0.0) + co2_saved
        self.bookings.rows = [
            b.model_copy(update={"status": "completed"})
            if b.ride_id == ride_id and b.status == "confirmed"
            else b
            for b in self.bookings.rows
        ]
        return "completed", len(riders)

    def get(self, db: object, *, user_id: UUID) -> Rewards | None:
        return Rewards(
            id=uuid4(),
            user_id=user_id,
            pet_stage=self.stages.get(user_id, self.start_stage),
            total_co2_saved=self.totals.get(user_id, 0.0),
            milestone=0,
        )

    def set_stage(self, db: object, *, user_id: UUID, pet_stage: PetStage) -> None:
        self.stages[user_id] = pet_stage


def install(
    monkeypatch: pytest.MonkeyPatch,
    *,
    car: Vehicle | None = None,
    departed: bool = True,
    bookings: list[Booking] | None = None,
    stage: PetStage = "egg",
) -> tuple[Ride, FakeRewardsRepo, FakeBookingRepo]:
    car = car or vehicle()
    row = ride(car, departed=departed)
    rides = Rides(row)
    booking_repo = FakeBookingRepo(bookings)
    rewards = FakeRewardsRepo(rides, booking_repo, stage=stage)
    monkeypatch.setattr(rewards_service, "user_repository", FakeUserRepo())
    monkeypatch.setattr(rewards_service, "ride_repository", FakeRideRepo(rides))
    monkeypatch.setattr(rewards_service, "vehicle_repository", FakeVehicleRepo(car))
    monkeypatch.setattr(rewards_service, "booking_repository", booking_repo)
    monkeypatch.setattr(rewards_service, "rewards_repository", rewards)
    return row, rewards, booking_repo


def complete(row: Ride, clerk_id: str = DRIVER.clerk_id) -> Any:
    return rewards_service.complete_ride(DB, clerk_id=clerk_id, ride_id=row.id)


# --- the figures ---------------------------------------------------------


def test_a_completed_ride_awards_the_documented_amount(monkeypatch: pytest.MonkeyPatch) -> None:
    """changes.md 1.5, the Corolla row: 18 km with 2 passengers avoids 7.26 kg
    and is worth 726 points. Not re-derived here - if this and the doc ever
    disagree, one of them is wrong and the doc is the one that was hand-checked."""
    row, rewards, _ = install(
        monkeypatch,
        bookings=[booking(uuid4(), PASSENGER.id)],
    )
    # the booking has to be on this ride
    rewards.bookings.rows = [booking(row.id, PASSENGER.id), booking(row.id, uuid4())]

    result = complete(row)

    assert result.co2_saved == pytest.approx(CO2_TWO_PASSENGERS, abs=1e-3)
    assert result.points_earned == POINTS_TWO_PASSENGERS


def test_everyone_on_the_ride_is_credited_the_full_figure(monkeypatch: pytest.MonkeyPatch) -> None:
    """The driver and both passengers each gain 7.26 kg, not a third of it.
    Gamification, not carbon accounting: the pet thresholds were calibrated
    against one user banking the whole figure per ride (CLAUDE.md, 3 rides to
    hatched). Summed across users it exceeds the CO2 actually avoided."""
    row, rewards, _ = install(monkeypatch)
    second = uuid4()
    rewards.bookings.rows = [booking(row.id, PASSENGER.id), booking(row.id, second)]

    complete(row)

    assert set(rewards.credited) == {DRIVER.id, PASSENGER.id, second}
    for uid in (DRIVER.id, PASSENGER.id, second):
        assert rewards.credited[uid] == pytest.approx(CO2_TWO_PASSENGERS, abs=1e-3)
        assert rewards.points[uid] == POINTS_TWO_PASSENGERS


def test_a_solo_ride_is_worth_exactly_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    """Posting rides nobody books must not earn points. co2_avoided evaluates
    to exactly 0 at zero passengers, which is the property changes.md 1.6 chose
    the formula for - so this is 0.0, not merely small."""
    row, rewards, _ = install(monkeypatch, bookings=[])

    result = complete(row)

    assert result.co2_saved == 0.0
    assert result.points_earned == 0
    assert rewards.points[DRIVER.id] == 0


def test_a_cancelled_booking_is_not_a_passenger(monkeypatch: pytest.MonkeyPatch) -> None:
    """A seat given back was not travelled in. Counting it would inflate both
    the avoided figure and the number of people paid."""
    row, rewards, _ = install(monkeypatch)
    rewards.bookings.rows = [
        booking(row.id, PASSENGER.id),
        booking(row.id, uuid4(), status="cancelled"),
    ]

    result = complete(row)

    assert set(rewards.credited) == {DRIVER.id, PASSENGER.id}
    # one passenger, not two
    assert result.co2_saved < CO2_TWO_PASSENGERS


# --- exactly once --------------------------------------------------------


def test_completing_twice_awards_once(monkeypatch: pytest.MonkeyPatch) -> None:
    """The whole difficulty of this sprint. The second call must be a no-op,
    not merely non-erroring: balances are checked, not just the absence of an
    exception."""
    row, rewards, _ = install(monkeypatch)
    rewards.bookings.rows = [booking(row.id, PASSENGER.id)]

    first = complete(row)
    after_first = dict(rewards.points)

    second = complete(row)

    assert second.already_completed is True
    assert rewards.points == after_first
    assert second.points_earned == first.points_earned


def test_the_second_call_does_not_raise(monkeypatch: pytest.MonkeyPatch) -> None:
    """A driver tapping twice has done nothing wrong, and the UI should show
    them the same completed ride rather than an error."""
    row, _, _ = install(monkeypatch)
    complete(row)

    complete(row)  # must not raise


# --- who may complete ----------------------------------------------------


def test_only_the_driver_can_complete(monkeypatch: pytest.MonkeyPatch) -> None:
    """A passenger completing the ride would be awarding themselves points for
    a trip that may not have happened."""
    row, rewards, _ = install(monkeypatch)

    with pytest.raises(PermissionDeniedError):
        complete(row, clerk_id=PASSENGER.clerk_id)

    assert rewards.credited == {}


def test_a_ride_that_has_not_departed_cannot_be_completed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    row, rewards, _ = install(monkeypatch, departed=False)

    with pytest.raises(InvalidInputError):
        complete(row)

    assert rewards.credited == {}


def test_a_ride_that_does_not_exist_is_a_not_found(monkeypatch: pytest.MonkeyPatch) -> None:
    install(monkeypatch)

    with pytest.raises(NotFoundError):
        rewards_service.complete_ride(DB, clerk_id=DRIVER.clerk_id, ride_id=uuid4())


# --- pet progression -----------------------------------------------------


@pytest.mark.parametrize(
    ("total", "stage"),
    [
        (0.0, "egg"),
        (14.99, "egg"),
        (15.0, "hatched"),
        (59.99, "hatched"),
        (60.0, "juvenile"),
        (199.99, "juvenile"),
        (200.0, "adult"),
        (799.99, "adult"),
        (800.0, "legendary"),
    ],
)
def test_the_stage_changes_exactly_on_the_threshold(total: float, stage: str) -> None:
    """Boundaries, not comfortably above them: 15.0 hatches and 14.99 does not.
    The thresholds live in core/constants.py with their calibration, and the
    service re-exports the rule rather than restating it."""
    assert rewards_service.stage_for(total) == stage


def test_completing_moves_the_pet_up(monkeypatch: pytest.MonkeyPatch) -> None:
    """Two passengers on a Corolla is 7.26 kg; two such rides is 14.5 and still
    an egg, three is 21.8 and hatched - the 3-rides-to-hatched calibration."""
    row, rewards, _ = install(monkeypatch)
    rewards.bookings.rows = [booking(row.id, PASSENGER.id), booking(row.id, uuid4())]
    rewards.totals[DRIVER.id] = CO2_TWO_PASSENGERS * 2  # 14.5 kg banked

    complete(row)

    assert rewards.stages[DRIVER.id] == "hatched"
