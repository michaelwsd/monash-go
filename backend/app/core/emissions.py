"""Emissions maths

co2_solo / co2_rideshare / co2_transit
-> the comparison dashboard. "What does this trip cost in each mode,
in this driver's actual car?"

co2_avoided
-> rewards. "What did carpooling avoid, against a fleet-average counterfactual?"
"""

from collections.abc import Sequence  # stricter than Iterable

# checked before running by mypy, can be unpacked, basemodel is checked at runtime
from typing import NamedTuple

from app.core.constants import EMISSION_FACTORS, FLEET_AVG_RATE, TRANSIT_FACTORS
from app.schemas.enums import FuelType, TransitMode


class TransitLeg(NamedTuple):
    """one step of a transit route"""

    mode: TransitMode
    distance_km: float


def co2_solo(distance_km: float, fuel_consumption: float, fuel_type: FuelType) -> float:
    """
    kg co2 emission for driving this vehicle alone

    - fuel consumption is L/100km for petrol, diesel and hybrid, kWh/100km for electric
    """
    return distance_km * (fuel_consumption / 100) * EMISSION_FACTORS[fuel_type]


def co2_rideshare(
    distance_km: float, fuel_consumption: float, fuel_type: FuelType, occupants: int
) -> float:
    """per occupant co2 emission once ride is shared"""
    if occupants < 1:
        raise ValueError("a ride has at least one occupant")
    return co2_solo(distance_km, fuel_consumption, fuel_type) / occupants


def co2_transit(legs: Sequence[TransitLeg]) -> float:
    """co2 emission for public transport summed over legs"""
    return sum((leg.distance_km * TRANSIT_FACTORS[leg.mode] for leg in legs), 0.0)


def co2_avoided(
    distance_km: float, fuel_consumption: float, fuel_type: FuelType, passengers: int
) -> float:
    """
    kg co2 emission that car pooling avoided compared to driving solo
    """
    if passengers < 0:
        raise ValueError("passengers cannot be negative")
    occupants = passengers + 1
    # what the passengers would have emitted driving solo, fleet avg is the average emission
    benchmark = passengers * distance_km * FLEET_AVG_RATE
    actual = (passengers / occupants) * co2_solo(distance_km, fuel_consumption, fuel_type)
    return max(0.0, benchmark - actual)
