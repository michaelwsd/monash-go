"""Vehicle registration rules without a live Supabase project."""

from datetime import UTC, datetime
from typing import cast
from uuid import uuid4

import pytest

from app.exceptions.errors import InvalidInputError, NotFoundError
from app.schemas.user import User
from app.schemas.vehicle import VehicleCreate, VehicleReference, VehicleResponse
from app.services import vehicle_service
from supabase import Client

NO_DB = cast(Client, None)


class FakeUserRepo:
    def __init__(self) -> None:
        self.user: User | None = None

    def get_by_clerk_id(self, db: object, clerk_id: str) -> User | None:
        return self.user if clerk_id == "user_1" else None


class FakeVehicleRepo:
    def __init__(self) -> None:
        self.created: list[VehicleResponse] = []
        self.references: list[VehicleReference] = []

    def get_reference_by_id(self, db: object, *, reference_id: int) -> VehicleReference | None:
        return next((item for item in self.references if item.id == reference_id), None)

    def find_exact_reference(
        self, db: object, *, make: str, model: str, year: int, fuel_type: str
    ) -> VehicleReference | None:
        matches = [
            item
            for item in self.references
            if (item.make, item.model, item.year, item.fuel_type) == (make, model, year, fuel_type)
        ]
        return matches[0] if len(matches) == 1 else None

    def create(self, db: object, *, owner_id: object, vehicle: VehicleCreate) -> VehicleResponse:
        result = VehicleResponse(
            id=uuid4(), owner_id=owner_id, created_at=datetime.now(tz=UTC), **vehicle.model_dump()
        )
        self.created.append(result)
        return result

    def list_for_owner(self, db: object, *, owner_id: object) -> list[VehicleResponse]:
        return [vehicle for vehicle in self.created if vehicle.owner_id == owner_id]


@pytest.fixture
def repos(monkeypatch: pytest.MonkeyPatch) -> FakeVehicleRepo:
    users, vehicles = FakeUserRepo(), FakeVehicleRepo()
    users.user = User(
        id=uuid4(),
        clerk_id="user_1",
        email="test@student.monash.edu",
        phone="",
        full_name="Test User",
        role="passenger",
        is_concession=False,
        home_campus=None,
        green_points=0,
        joined_at=datetime.now(tz=UTC),
    )
    monkeypatch.setattr(vehicle_service, "user_repository", users)
    monkeypatch.setattr(vehicle_service, "vehicle_repository", vehicles)
    return vehicles


def test_registers_a_vehicle_for_the_authenticated_user(repos: FakeVehicleRepo) -> None:
    vehicle = VehicleCreate(
        make="Toyota",
        model="Corolla",
        year=2020,
        fuel_type="hybrid",
        fuel_consumption=4.2,
    )

    result = vehicle_service.register(NO_DB, clerk_id="user_1", vehicle=vehicle)

    assert result.owner_id
    assert result.fuel_consumption == 4.2
    assert repos.created == [result]


def test_vehicle_registration_requires_a_synced_user(repos: FakeVehicleRepo) -> None:
    with pytest.raises(NotFoundError):
        vehicle_service.register(
            NO_DB,
            clerk_id="unknown",
            vehicle=VehicleCreate(
                make="Toyota",
                model="Corolla",
                year=2020,
                fuel_type="hybrid",
                fuel_consumption=4.2,
            ),
        )


def test_selected_reference_overrides_client_vehicle_values(repos: FakeVehicleRepo) -> None:
    repos.references = [
        VehicleReference(
            id=42,
            make="Toyota",
            model="Corolla",
            year=2020,
            fuel_type="hybrid",
            engine_size=1.8,
            avg_consumption=4.2,
        )
    ]

    result = vehicle_service.register(
        NO_DB,
        clerk_id="user_1",
        vehicle=VehicleCreate(
            make="Incorrect",
            model="Details",
            year=2000,
            fuel_type="petrol",
            fuel_consumption=99,
            reference_id=42,
        ),
    )

    assert (result.make, result.model, result.year, result.fuel_type, result.fuel_consumption) == (
        "Toyota",
        "Corolla",
        2020,
        "hybrid",
        4.2,
    )


def test_exact_manual_match_overrides_client_consumption(repos: FakeVehicleRepo) -> None:
    repos.references = [
        VehicleReference(
            id=42,
            make="Toyota",
            model="Corolla",
            year=2020,
            fuel_type="hybrid",
            engine_size=1.8,
            avg_consumption=4.2,
        )
    ]

    result = vehicle_service.register(
        NO_DB,
        clerk_id="user_1",
        vehicle=VehicleCreate(
            make="Toyota",
            model="Corolla",
            year=2020,
            fuel_type="hybrid",
            fuel_consumption=5.5,
        ),
    )

    assert result.fuel_consumption == 4.2


def test_manual_consumption_has_a_fuel_specific_limit(repos: FakeVehicleRepo) -> None:
    with pytest.raises(InvalidInputError, match="30 L/100 km"):
        vehicle_service.register(
            NO_DB,
            clerk_id="user_1",
            vehicle=VehicleCreate(
                make="Custom",
                model="Vehicle",
                year=2020,
                fuel_type="petrol",
                fuel_consumption=30.1,
            ),
        )


def test_ambiguous_manual_match_keeps_the_supplied_consumption(repos: FakeVehicleRepo) -> None:
    repos.references = [
        VehicleReference(
            id=42,
            make="Toyota",
            model="Corolla",
            year=2020,
            fuel_type="hybrid",
            engine_size=1.8,
            avg_consumption=4.2,
        ),
        VehicleReference(
            id=43,
            make="Toyota",
            model="Corolla",
            year=2020,
            fuel_type="hybrid",
            engine_size=2.0,
            avg_consumption=4.8,
        ),
    ]

    result = vehicle_service.register(
        NO_DB,
        clerk_id="user_1",
        vehicle=VehicleCreate(
            make="Toyota",
            model="Corolla",
            year=2020,
            fuel_type="hybrid",
            fuel_consumption=4.5,
        ),
    )

    assert result.fuel_consumption == 4.5
