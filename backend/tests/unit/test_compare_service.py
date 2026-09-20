"""The comparison dashboard at the service layer: the same trip priced three
ways, against in-memory fakes.

Almost nothing here is new arithmetic. co2_*, cost_* and the route cache are
already tested on their own; this proves the service feeds them the right
inputs and puts the answers in the right places. The vehicle and distance are
lifted from docs/changes.md 1.5 - a Toyota Corolla 2020 at 7.1 L/100km on an
18 km trip - so the expected figures are ones that were verified by hand there.

Two of these tests guard against shortcuts the build plan calls out by name:
transit emissions must be summed over legs, and an EV must never ask for a
fuel price.
"""

from datetime import UTC, datetime, timedelta
from typing import Any, cast
from uuid import UUID, uuid4

import httpx
import pytest

from app.core.constants import ELECTRICITY_PRICE, MYKI_CONCESSION_FARE, MYKI_FULL_FARE
from app.exceptions.errors import NotFoundError
from app.schemas.booking import Booking
from app.schemas.enums import Campus, FuelType, TravelMode
from app.schemas.ride import Ride
from app.schemas.route import CampusRoute, TransitLeg
from app.schemas.user import User
from app.schemas.vehicle import Vehicle
from app.services import compare_service
from supabase import Client

# the fakes never touch either, so there is nothing real to pass
DB = cast(Client, None)
HTTP = cast(httpx.Client, None)

DISTANCE_KM = 18.0
FUEL_PRICE = 2.159  # dollars per litre, the median from the recorded fixture

VIEWER = User(
    id=uuid4(),
    clerk_id="user_viewer",
    email="v@student.monash.edu",
    phone="0400000000",
    full_name="Val Viewer",
    role="passenger",
    is_concession=True,
    home_campus="clayton",
    green_points=0,
    joined_at=datetime.now(UTC),
)
DRIVER_ID = uuid4()


def vehicle(fuel_type: FuelType = "petrol", consumption: float = 7.1) -> Vehicle:
    """Defaults to the Corolla from changes.md 1.5."""
    return Vehicle(
        id=uuid4(),
        owner_id=DRIVER_ID,
        make="Toyota",
        model="Corolla",
        year=2020,
        fuel_type=fuel_type,
        fuel_consumption=consumption,
        created_at=datetime.now(UTC),
    )


def ride(car: Vehicle) -> Ride:
    return Ride(
        id=uuid4(),
        driver_id=DRIVER_ID,
        vehicle_id=car.id,
        origin="clayton",
        destination="caulfield",
        departure_at=datetime.now(UTC) + timedelta(days=1),
        total_seats=3,
        available_seats=3,
        distance_km=DISTANCE_KM,
        status="open",
        co2_saved=None,
        points_earned=None,
        created_at=datetime.now(UTC),
    )


def leg(mode: str, km: float, minutes: int = 10) -> TransitLeg:
    return TransitLeg(mode=cast(Any, mode), distance_km=km, duration_min=minutes, line=None)


# Two buses, from the recorded Clayton -> Caulfield fixture. Bus is 0.077 kg/km
# and walking is nothing, so this journey is (5.225 + 21.74) x 0.077.
TRANSIT_LEGS = [
    leg("walk", 1.229, 16),
    leg("bus", 5.225, 12),
    leg("bus", 21.74, 59),
    leg("walk", 0.181, 3),
]

DRIVE_MIN = 27
TRANSIT_MIN = 101


class FakeUserRepo:
    def get_by_clerk_id(self, db: object, clerk_id: str) -> User | None:
        return VIEWER if clerk_id == VIEWER.clerk_id else None


class FakeRideRepo:
    def __init__(self, row: Ride | None) -> None:
        self.row = row

    def get_ride(self, db: object, ride_id: UUID) -> Ride | None:
        return self.row if self.row and self.row.id == ride_id else None


class FakeVehicleRepo:
    def __init__(self, row: Vehicle) -> None:
        self.row = row

    def get_by_id(self, db: object, vehicle_id: UUID) -> Vehicle | None:
        return self.row if self.row.id == vehicle_id else None


class FakeBookingRepo:
    """How many seats are taken, and whether the viewer holds one of them."""

    def __init__(self, *, confirmed: int = 0, viewer_booked: bool = False) -> None:
        self.confirmed = confirmed
        self.viewer_booked = viewer_booked

    def count_confirmed(self, db: object, *, ride_id: UUID) -> int:
        return self.confirmed

    def get_confirmed(self, db: object, *, ride_id: UUID, passenger_id: UUID) -> Booking | None:
        if not self.viewer_booked or passenger_id != VIEWER.id:
            return None
        return Booking(
            id=uuid4(),
            ride_id=ride_id,
            passenger_id=passenger_id,
            status="confirmed",
            created_at=datetime.now(UTC),
        )


class FakeRouteService:
    """Both cached rows for the pair. `legs` is what the transit row carries."""

    def __init__(self, legs: list[TransitLeg] = TRANSIT_LEGS) -> None:
        self.legs = legs

    def get_route(
        self,
        db: object,
        http: object,
        *,
        origin: Campus,
        destination: Campus,
        travel_mode: TravelMode,
    ) -> CampusRoute:
        if travel_mode == "drive":
            return CampusRoute(
                id=uuid4(),
                origin=origin,
                destination=destination,
                travel_mode="drive",
                distance_km=23.24,
                duration_min=DRIVE_MIN,
                route_summary="Wellington Rd and M1",
                legs=None,
                cached_at=datetime.now(UTC),
            )
        return CampusRoute(
            id=uuid4(),
            origin=origin,
            destination=destination,
            travel_mode="transit",
            distance_km=sum(leg.distance_km for leg in self.legs),
            duration_min=TRANSIT_MIN,
            route_summary="Bus 691 → Bus 900",
            legs=self.legs,
            cached_at=datetime.now(UTC),
        )


class FakeFuelService:
    """Records every price it is asked for. An EV must never appear here."""

    def __init__(self) -> None:
        self.asked: list[FuelType] = []

    def latest_price(self, db: object, *, fuel_type: FuelType) -> float:
        self.asked.append(fuel_type)
        return FUEL_PRICE


def install(
    monkeypatch: pytest.MonkeyPatch,
    *,
    car: Vehicle | None = None,
    confirmed: int = 0,
    viewer_booked: bool = False,
    legs: list[TransitLeg] = TRANSIT_LEGS,
    viewer: User = VIEWER,
) -> tuple[Ride, FakeFuelService]:
    car = car or vehicle()
    row = ride(car)
    fuel = FakeFuelService()
    monkeypatch.setattr(compare_service, "user_repository", FakeUserRepo())
    monkeypatch.setattr(compare_service, "ride_repository", FakeRideRepo(row))
    monkeypatch.setattr(compare_service, "vehicle_repository", FakeVehicleRepo(car))
    monkeypatch.setattr(
        compare_service,
        "booking_repository",
        FakeBookingRepo(confirmed=confirmed, viewer_booked=viewer_booked),
    )
    monkeypatch.setattr(compare_service, "route_service", FakeRouteService(legs))
    monkeypatch.setattr(compare_service, "fuel_service", fuel)
    if viewer is not VIEWER:
        monkeypatch.setattr(FakeUserRepo, "get_by_clerk_id", lambda self, db, clerk_id: viewer)
    return row, fuel


def compare(row: Ride) -> Any:
    return compare_service.compare(DB, HTTP, clerk_id=VIEWER.clerk_id, ride_id=row.id)


def mode(result: Any, name: str) -> Any:
    return next(m for m in result.modes if m.mode == name)


# --- the numbers from changes.md 1.5 ------------------------------------


def test_the_response_has_all_three_modes(monkeypatch: pytest.MonkeyPatch) -> None:
    row, _ = install(monkeypatch)
    result = compare(row)
    assert [m.mode for m in result.modes] == ["carpool", "transit", "private"]


def test_private_is_the_corolla_driving_alone(monkeypatch: pytest.MonkeyPatch) -> None:
    """18 km x 7.1/100 x 2.31 = 2.952 kg, the figure changes.md verified by
    hand. Cost is the same shape with the fuel price in place of the factor."""
    row, _ = install(monkeypatch)
    private = mode(compare(row), "private")
    assert private.co2_kg == pytest.approx(2.952, abs=1e-3)
    assert private.cost == pytest.approx(18 * 0.071 * FUEL_PRICE, abs=1e-3)
    assert private.duration_min == DRIVE_MIN


def test_carpool_splits_co2_over_occupants_and_cost_over_passengers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Two passengers already booked; the viewer would be the third. CO2 is
    per occupant (four people in the car, driver included) and cost is per
    passenger (three, the driver was paying anyway). Both denominators are
    the proposal's, and they are deliberately not the same."""
    row, _ = install(monkeypatch, confirmed=2)
    result = compare(row)
    carpool = mode(result, "carpool")
    assert result.riders == 3
    assert carpool.co2_kg == pytest.approx(2.952 / 4, abs=1e-3)
    assert carpool.cost == pytest.approx(18 * 0.071 * FUEL_PRICE / 3, abs=1e-3)
    assert carpool.duration_min == DRIVE_MIN


def test_a_ride_nobody_has_booked_compares_for_one_rider(monkeypatch: pytest.MonkeyPatch) -> None:
    """The viewer is deciding whether to be the first. Dividing by zero
    passengers would price the carpool at nothing, which is the one number
    that could never be true."""
    row, _ = install(monkeypatch, confirmed=0)
    result = compare(row)
    assert result.riders == 1
    assert mode(result, "carpool").cost == pytest.approx(18 * 0.071 * FUEL_PRICE, abs=1e-3)
    assert mode(result, "carpool").co2_kg == pytest.approx(2.952 / 2, abs=1e-3)


def test_a_viewer_who_already_holds_a_seat_is_not_counted_twice(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Two confirmed seats, one of them the viewer's. The comparison is for
    the ride as it stands, not for a phantom third passenger."""
    row, _ = install(monkeypatch, confirmed=2, viewer_booked=True)
    assert compare(row).riders == 2


# --- transit -------------------------------------------------------------


def test_transit_uses_the_cached_journey(monkeypatch: pytest.MonkeyPatch) -> None:
    row, _ = install(monkeypatch)
    result = compare(row)
    transit = mode(result, "transit")
    assert transit.duration_min == TRANSIT_MIN
    assert transit.cost == MYKI_CONCESSION_FARE
    assert transit.co2_kg == pytest.approx((5.225 + 21.74) * 0.077, abs=1e-3)
    assert result.transit_legs == TRANSIT_LEGS


def test_transit_emissions_are_the_sum_over_legs_not_one_factor(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The shortcut build_plan.md names: total distance times one factor. On
    a walk + train + tram journey the difference is the whole tram leg, which
    is solar-powered and emits nothing, and the walk, which emits nothing.

    11.4 km x 0.038 would give 0.433 kg. Only the 9.1 km train leg counts:
    9.1 x 0.038 = 0.346 kg."""
    mixed = [leg("walk", 0.4, 5), leg("train", 9.1, 14), leg("tram", 1.9, 8)]
    row, _ = install(monkeypatch, legs=mixed)
    transit = mode(compare(row), "transit")
    assert transit.co2_kg == pytest.approx(9.1 * 0.038, abs=1e-4)
    assert transit.co2_kg != pytest.approx(11.4 * 0.038, abs=1e-4)


def test_a_full_fare_viewer_pays_the_full_fare(monkeypatch: pytest.MonkeyPatch) -> None:
    staff = VIEWER.model_copy(update={"is_concession": False})
    row, _ = install(monkeypatch, viewer=staff)
    assert mode(compare(row), "transit").cost == MYKI_FULL_FARE


# --- electric ------------------------------------------------------------


def test_an_ev_is_costed_on_electricity_and_never_asks_for_fuel(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Sprint 2's EV case, reused rather than re-derived: a Tesla Model 3 at
    15.8 kWh/100km. Consumption is kWh, the price is $/kWh, and the fuel table
    is never consulted - feeding a petrol price in would be wrong by ten
    times, and every petrol figure has a scope-1 emission the EV lacks."""
    row, fuel = install(monkeypatch, car=vehicle("electric", 15.8))
    result = compare(row)
    private = mode(result, "private")
    assert private.cost == pytest.approx(18 * 0.158 * ELECTRICITY_PRICE, abs=1e-3)
    assert private.co2_kg == 0.0
    assert mode(result, "carpool").co2_kg == 0.0
    assert fuel.asked == []


def test_a_petrol_car_asks_for_the_petrol_price_once(monkeypatch: pytest.MonkeyPatch) -> None:
    """Both driving modes share the one price. Two lookups would be two
    round trips for the same row."""
    row, fuel = install(monkeypatch)
    compare(row)
    assert fuel.asked == ["petrol"]


# --- what it carries for the frontend -----------------------------------


def test_the_response_names_its_inputs(monkeypatch: pytest.MonkeyPatch) -> None:
    """The dashboard shows its assumptions - "fuel at $2.16, concession
    myki" - so a reader can tell why two comparisons differ. That only works
    if the inputs travel with the answer."""
    row, _ = install(monkeypatch, confirmed=1)
    result = compare(row)
    assert result.ride_id == row.id
    assert result.riders == 2
    assert result.is_concession is True
    assert result.fuel_price == pytest.approx(FUEL_PRICE)


def test_an_ev_reports_no_fuel_price(monkeypatch: pytest.MonkeyPatch) -> None:
    row, _ = install(monkeypatch, car=vehicle("electric", 15.8))
    assert compare(row).fuel_price is None


# --- refusals ------------------------------------------------------------


def test_a_ride_that_does_not_exist_is_a_not_found(monkeypatch: pytest.MonkeyPatch) -> None:
    install(monkeypatch)
    with pytest.raises(NotFoundError):
        compare_service.compare(DB, HTTP, clerk_id=VIEWER.clerk_id, ride_id=uuid4())


def test_a_caller_with_no_user_row_is_a_not_found(monkeypatch: pytest.MonkeyPatch) -> None:
    row, _ = install(monkeypatch)
    with pytest.raises(NotFoundError):
        compare_service.compare(DB, HTTP, clerk_id="user_nobody", ride_id=row.id)
