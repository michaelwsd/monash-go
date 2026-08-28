"""cost math for the comparison dashboard"""

from app.core.constants import ELECTRICITY_PRICE, MYKI_CONCESSION_FARE, MYKI_FULL_FARE
from app.schemas.enums import FuelType


def price_per_unit(fuel_type: FuelType, fuel_price: float | None) -> float:
    if fuel_type == "electric":
        return ELECTRICITY_PRICE
    if fuel_price is None:
        raise ValueError(f"fuel_price is required for fuel_type={fuel_type!r}")
    return fuel_price


def cost_solo(
    distance_km: float,
    fuel_consumption: float,
    fuel_type: FuelType,
    fuel_price: float | None = None,
) -> float:
    """cost of driving solo"""
    return distance_km * (fuel_consumption / 100) * price_per_unit(fuel_type, fuel_price)


def cost_rideshare(
    distance_km: float,
    fuel_consumption: float,
    fuel_type: FuelType,
    passengers: int,
    fuel_price: float | None = None,
) -> float:
    """cost for each passenger"""
    if passengers < 0:
        raise ValueError("passengers cannot be negative")
    if passengers == 0:
        return 0.0
    return cost_solo(distance_km, fuel_consumption, fuel_type, fuel_price) / passengers


def cost_transit(is_concession: bool) -> float:
    return MYKI_CONCESSION_FARE if is_concession else MYKI_FULL_FARE
