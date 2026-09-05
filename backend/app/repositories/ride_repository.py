from datetime import datetime
from typing import Any
from uuid import UUID

from app.schemas.enums import Campus
from app.schemas.ride import Ride
from supabase import Client

TABLE = "rides"


def insert(
    db: Client,
    *,
    driver_id: UUID,
    vehicle_id: UUID,
    origin: Campus,
    destination: Campus,
    departure_at: datetime,
    total_seats: int,
    available_seats: int,
    distance_km: float,
) -> Ride:
    payload: dict[str, Any] = {
        "driver_id": str(driver_id),
        "vehicle_id": str(vehicle_id),
        "origin": origin,
        "destination": destination,
        "departure_at": departure_at.isoformat(),
        "total_seats": total_seats,
        "available_seats": available_seats,
        "distance_km": distance_km,
    }

    res = db.table(TABLE).insert(payload).execute()
    return Ride.model_validate(res.data[0])
