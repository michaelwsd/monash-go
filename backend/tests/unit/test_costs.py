"""Cost maths. The only interesting behaviour is the electric branch; the rest
is a multiplication, and the tests exist to pin the divisor and the fare
selection so a later refactor cannot quietly change either.
"""

import pytest

from app.core.constants import ELECTRICITY_PRICE, MYKI_CONCESSION_FARE, MYKI_FULL_FARE
from app.core.costs import cost_rideshare, cost_solo, cost_transit

DISTANCE_KM = 18.0
PETROL_PRICE = 1.90  # $/L, a plausible Servo Saver figure


def test_solo_cost_for_a_liquid_fuel() -> None:
    assert cost_solo(DISTANCE_KM, 7.1, "petrol", PETROL_PRICE) == pytest.approx(2.4282)


def test_electric_uses_the_electricity_price_not_the_fuel_price() -> None:
    """The changes.md 4 branch. A Tesla at 15.8 kWh/100km over 18 km costs
    $0.80. Multiply those kWh by a petrol price instead and you get $5.40 -
    6.7x too high, not "ten times too low" as the doc currently claims."""
    correct = cost_solo(DISTANCE_KM, 15.8, "electric", PETROL_PRICE)

    assert correct == pytest.approx(18 * 0.158 * ELECTRICITY_PRICE)
    assert correct == pytest.approx(0.802, abs=1e-3)
    # What the missing branch would have produced.
    assert pytest.approx(5.404, abs=1e-3) == 18 * 0.158 * PETROL_PRICE


def test_electric_ignores_a_missing_fuel_price() -> None:
    """fuel_prices may have no electric row at all; the EV path must not need one."""
    assert cost_solo(DISTANCE_KM, 15.8, "electric") == pytest.approx(0.802, abs=1e-3)


def test_a_liquid_fuel_without_a_price_is_a_caller_bug() -> None:
    with pytest.raises(ValueError, match="fuel_price is required"):
        cost_solo(DISTANCE_KM, 7.1, "petrol")


def test_rideshare_splits_across_passengers_and_the_driver_pays_nothing() -> None:
    """Divides by passengers, not occupants - CLAUDE.md "Cost Estimation",
    read literally and confirmed. Deliberately unlike co2_rideshare."""
    solo = cost_solo(DISTANCE_KM, 7.1, "petrol", PETROL_PRICE)
    assert cost_rideshare(DISTANCE_KM, 7.1, "petrol", 2, PETROL_PRICE) == pytest.approx(solo / 2)
    assert cost_rideshare(DISTANCE_KM, 7.1, "petrol", 1, PETROL_PRICE) == pytest.approx(solo)


def test_rideshare_with_nobody_aboard_is_zero_not_a_crash() -> None:
    assert cost_rideshare(DISTANCE_KM, 7.1, "petrol", 0, PETROL_PRICE) == 0.0


def test_rideshare_rejects_negative_passengers() -> None:
    with pytest.raises(ValueError, match="cannot be negative"):
        cost_rideshare(DISTANCE_KM, 7.1, "petrol", -1, PETROL_PRICE)


def test_transit_is_a_flat_fare_by_concession_status() -> None:
    assert cost_transit(is_concession=False) == MYKI_FULL_FARE
    assert cost_transit(is_concession=True) == MYKI_CONCESSION_FARE
    assert MYKI_CONCESSION_FARE < MYKI_FULL_FARE
