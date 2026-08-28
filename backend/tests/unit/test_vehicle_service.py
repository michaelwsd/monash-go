"""Vehicle registration at the service layer, against in-memory fakes."""

from datetime import UTC, datetime
from typing import Any, cast
from uuid import UUID, uuid4

import pytest

from app.exceptions.errors import InvalidInputError, NotFoundError
from app.schemas.enums import UserRole
from app.schemas.user import User
from app.schemas.vehicle import Vehicle, VehicleCreate, VehicleReference
from app.services import vehicle_service
from supabase import Client

# the fakes never touch it, so there is nothing real to pass
DB = cast(Client, None)
OWNER = User(
    id=uuid4(),
    clerk_id="user_1",
    email="a@student.monash.edu",
    phone="",
    full_name="A B",
    role="passenger",
    is_concession=False,
    home_campus=None,
    green_points=0,
    joined_at=datetime.now(tz=UTC),
)


def reference(**overrides: Any) -> VehicleReference:
    fields: dict[str, Any] = {
        "id": 1,
        "make": "Toyota",
        "model": "Corolla XSE",
        "year": 2020,
        "fuel_type": "petrol",
        "engine_size": 1.8,
        "avg_consumption": 7.1,
    }
    fields.update(overrides)
    return VehicleReference(**fields)


def payload(**overrides: Any) -> VehicleCreate:
    fields: dict[str, Any] = {
        "make": "Toyota",
        "model": "Corolla",
        "year": 2020,
        "fuel_type": "petrol",
        "fuel_consumption": 7.1,
    }
    fields.update(overrides)
    return VehicleCreate(**fields)


class FakeUserRepo:
    """Holds one mutable user, so a role promotion is visible to the test."""

    def __init__(self, role: UserRole = "passenger") -> None:
        self.user = OWNER.model_copy(update={"role": role})

    def get_by_clerk_id(self, db: object, clerk_id: str) -> User | None:
        return self.user if clerk_id == self.user.clerk_id else None

    def set_role(self, db: object, *, clerk_id: str, role: UserRole) -> User | None:
        if clerk_id != self.user.clerk_id:
            return None
        self.user = self.user.model_copy(update={"role": role})
        return self.user


class FakeVehicleRepo:
    def __init__(self) -> None:
        self.rows: list[Vehicle] = []

    def insert(self, db: object, *, owner_id: UUID, **fields: Any) -> Vehicle:
        vehicle = Vehicle(id=uuid4(), owner_id=owner_id, created_at=datetime.now(tz=UTC), **fields)
        self.rows.append(vehicle)
        return vehicle


class FakeReferenceRepo:
    """exact is what find_match returns; tiers are the three relaxation
    queries, in order. calls records which tiers actually ran."""

    def __init__(
        self,
        exact: VehicleReference | None = None,
        by_id: VehicleReference | None = None,
        tiers: tuple[list[VehicleReference], ...] = ([], [], []),
    ) -> None:
        self.exact = exact
        self.by_id = by_id
        self.tiers = tiers
        self.calls: list[str] = []

    def get_by_id(self, db: object, reference_id: int) -> VehicleReference | None:
        return self.by_id

    def find_match(self, db: object, **kwargs: Any) -> VehicleReference | None:
        return self.exact

    def same_model_any_year(self, db: object, **kwargs: Any) -> list[VehicleReference]:
        self.calls.append("tier1")
        return self.tiers[0]

    def similar_model(self, db: object, **kwargs: Any) -> list[VehicleReference]:
        self.calls.append("tier2")
        return self.tiers[1]

    def same_make_and_fuel(self, db: object, **kwargs: Any) -> list[VehicleReference]:
        self.calls.append("tier3")
        return self.tiers[2]


def install(
    monkeypatch: pytest.MonkeyPatch,
    refs: FakeReferenceRepo,
    users: FakeUserRepo | None = None,
) -> FakeVehicleRepo:
    vehicles = FakeVehicleRepo()
    monkeypatch.setattr(vehicle_service, "user_repository", users or FakeUserRepo())
    monkeypatch.setattr(vehicle_service, "vehicle_repository", vehicles)
    monkeypatch.setattr(vehicle_service, "vehicle_reference_repository", refs)
    return vehicles


def test_car_absent_from_the_reference_data_still_registers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """MG, BYD, GWM, LDV and most utes are missing from the Canadian source."""
    vehicles = install(monkeypatch, FakeReferenceRepo())

    result = vehicle_service.register(
        DB,
        clerk_id="user_1",
        payload=payload(make="MG", model="ZS", fuel_consumption=7.4),
    )

    assert result.fuel_consumption == 7.4
    assert result.make == "MG"
    assert len(vehicles.rows) == 1


def test_exact_reference_match_wins_over_the_submitted_figure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    install(monkeypatch, FakeReferenceRepo(exact=reference()))

    result = vehicle_service.register(DB, clerk_id="user_1", payload=payload(fuel_consumption=1.0))

    assert result.fuel_consumption == 7.1


def test_picking_a_suggestion_stores_the_reference_rows_details(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """They typed 'Corolla' and picked 'Corolla XSE'. The dataset row wins for
    every field, so the stored vehicle matches a real entry."""
    install(monkeypatch, FakeReferenceRepo(by_id=reference(year=2019, avg_consumption=6.7)))

    result = vehicle_service.register(
        DB, clerk_id="user_1", payload=payload(reference_id=1, fuel_consumption=1.0)
    )

    assert result.model == "Corolla XSE"
    assert result.year == 2019
    assert result.fuel_consumption == 6.7


def test_unknown_reference_id_is_not_found(monkeypatch: pytest.MonkeyPatch) -> None:
    install(monkeypatch, FakeReferenceRepo(by_id=None))

    with pytest.raises(NotFoundError):
        vehicle_service.register(DB, clerk_id="user_1", payload=payload(reference_id=999))


def test_implausible_petrol_consumption_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    install(monkeypatch, FakeReferenceRepo())

    with pytest.raises(InvalidInputError):
        vehicle_service.register(DB, clerk_id="user_1", payload=payload(fuel_consumption=30.1))


def test_electric_uses_the_kwh_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    """44 kWh/100km is plausible for an EV and would fail if the branch were
    missing; 45.1 must still be rejected."""
    install(monkeypatch, FakeReferenceRepo())

    ok = vehicle_service.register(
        DB, clerk_id="user_1", payload=payload(fuel_type="electric", fuel_consumption=44.0)
    )
    assert ok.fuel_consumption == 44.0

    with pytest.raises(InvalidInputError):
        vehicle_service.register(
            DB, clerk_id="user_1", payload=payload(fuel_type="electric", fuel_consumption=45.1)
        )


def test_registering_a_car_makes_you_a_driver(monkeypatch: pytest.MonkeyPatch) -> None:
    """Without this nobody can post a ride in Sprint 3."""
    users = FakeUserRepo(role="passenger")
    install(monkeypatch, FakeReferenceRepo(), users)

    vehicle_service.register(DB, clerk_id="user_1", payload=payload())

    assert users.user.role == "driver"


def test_registering_a_second_car_changes_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    users = FakeUserRepo(role="driver")
    install(monkeypatch, FakeReferenceRepo(), users)

    vehicle_service.register(DB, clerk_id="user_1", payload=payload())

    assert users.user.role == "driver"


def test_promotion_never_demotes_someone_who_is_both(monkeypatch: pytest.MonkeyPatch) -> None:
    """Sprint 4 sets 'both' when a driver books a seat. Registering another
    car afterwards must not walk that back."""
    users = FakeUserRepo(role="both")
    install(monkeypatch, FakeReferenceRepo(), users)

    vehicle_service.register(DB, clerk_id="user_1", payload=payload())

    assert users.user.role == "both"


def test_a_rejected_registration_leaves_the_role_alone(monkeypatch: pytest.MonkeyPatch) -> None:
    """A driver with no car would let POST /rides reference a vehicle that
    was never written."""
    users = FakeUserRepo(role="passenger")
    install(monkeypatch, FakeReferenceRepo(), users)

    with pytest.raises(InvalidInputError):
        vehicle_service.register(DB, clerk_id="user_1", payload=payload(fuel_consumption=30.1))

    assert users.user.role == "passenger"


def test_suggestions_stop_at_the_first_tier_with_results(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    refs = FakeReferenceRepo(tiers=([reference(year=2018), reference(year=2022)], [], []))
    install(monkeypatch, refs)

    results = vehicle_service.suggest(
        DB, make="Toyota", model="Corolla XSE", year=2021, fuel_type="petrol"
    )

    assert refs.calls == ["tier1"]  # tiers 2 and 3 never queried
    assert results[0].reference.year == 2022  # closest year first
    assert results[0].match_reason == "same model, different year"


def test_suggestions_fall_through_to_the_loosest_tier(monkeypatch: pytest.MonkeyPatch) -> None:
    refs = FakeReferenceRepo(tiers=([], [], [reference(model="Yaris")]))
    install(monkeypatch, refs)

    results = vehicle_service.suggest(
        DB, make="Toyota", model="Unknown", year=2020, fuel_type="petrol"
    )

    assert refs.calls == ["tier1", "tier2", "tier3"]
    assert results[0].match_reason == "same make and fuel type"


def test_no_suggestions_is_an_empty_list(monkeypatch: pytest.MonkeyPatch) -> None:
    install(monkeypatch, FakeReferenceRepo())

    assert (
        vehicle_service.suggest(DB, make="Ferrari", model="F40", year=1990, fuel_type="petrol")
        == []
    )
