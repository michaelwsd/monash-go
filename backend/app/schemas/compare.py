from typing import Literal
from uuid import UUID

from pydantic import BaseModel

from app.schemas.enums import Campus
from app.schemas.route import TransitLeg


class ModeComparison(BaseModel):
    # single mode of travel
    mode: Literal["carpool", "transit", "private"]
    duration_min: int
    cost: float
    co2_kg: float


class ComparisonBase(BaseModel):
    # what every comparison carries: the three modes and the inputs behind them
    riders: int
    is_concession: bool
    fuel_price: float | None
    modes: list[ModeComparison]
    transit_legs: list[TransitLeg] | None


class Comparison(ComparisonBase):
    # one posted ride, priced with the driver's own car
    ride_id: UUID


class RouteEstimate(ComparisonBase):
    """A campus pair with no ride behind it, priced with the fleet-average car.

    Carries the route itself (distance, the road taken, the transit lines) so
    the search page can show the journey as well as the numbers.
    """

    origin: Campus
    destination: Campus
    distance_km: float
    fuel_consumption: float
    drive_summary: str | None
    transit_summary: str | None
