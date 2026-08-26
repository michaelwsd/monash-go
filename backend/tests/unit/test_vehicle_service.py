"""Vehicle registration rules without a live Supabase project."""

from datetime import UTC, datetime
from typing import cast
from uuid import uuid4

import pytest

from app.exceptions.errors import NotFoundError
from app.schemas.user import User
from app.schemas.vehicle import VehicleCreate, VehicleResponse
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
