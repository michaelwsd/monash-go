from typing import Literal
from uuid import UUID

from pydantic import BaseModel

from app.schemas.route import TransitLeg


class ModeComparison(BaseModel):
    # single mode of travel
    mode: Literal["carpool", "transit", "private"]
    duration_min: int
    cost: float
    co2_kg: float


class Comparison(BaseModel):
    # entire comparison response
    ride_id: UUID
    riders: int
    is_concession: bool
    fuel_price: float | None
    modes: list[ModeComparison]
    transit_legs: list[TransitLeg] | None
