"""The emissions engine, asserted against the hand-verified numbers in
docs/changes.md 1.5 rather than re-derived here. If a number in this file and
a number in changes.md disagree, one of them is a bug and the doc is usually
the one that was hand-typed.
"""

import pytest

from app.core.emissions import TransitLeg, co2_avoided, co2_rideshare, co2_solo, co2_transit
from app.schemas.enums import FuelType

# The changes.md 1.5 table: 18 km, 2 passengers.
# (label, consumption, fuel_type, co2_solo kg, co2_avoided kg)
FLEET_TABLE: list[tuple[str, float, FuelType, float, float]] = [
    ("Tesla Model 3 RWD 2024", 15.8, "electric", 0.00, 9.23076),
    ("Toyota Camry Hybrid 2024", 4.9, "hybrid", 2.03742, 7.87248),
    ("Toyota Corolla 2020", 7.1, "petrol", 2.95218, 7.26264),
    ("VW Golf 2015", 8.05, "petrol", 3.34719, 6.99944),
    ("Jeep Grand Cherokee 2020", 11.3, "petrol", 4.699134, 6.09804),
    ("Ford F-150 4X4 2020", 10.8, "diesel", 5.28768, 5.70564),
]

DISTANCE_KM = 18.0


@pytest.mark.parametrize(("label", "consumption", "fuel_type", "solo", "avoided"), FLEET_TABLE)
def test_changes_md_table_reproduces(
    label: str, consumption: float, fuel_type: FuelType, solo: float, avoided: float
) -> None:
    assert co2_solo(DISTANCE_KM, consumption, fuel_type) == pytest.approx(solo, abs=5e-3)
    assert co2_avoided(DISTANCE_KM, consumption, fuel_type, 2) == pytest.approx(avoided, abs=5e-3)


def test_an_unbooked_ride_avoids_exactly_nothing() -> None:
    """The property changes.md 1.6 rejected an alternative formula to keep.
    Not approx - exactly zero, for every vehicle in the table."""
    for _, consumption, fuel_type, _, _ in FLEET_TABLE:
        assert co2_avoided(DISTANCE_KM, consumption, fuel_type, 0) == 0.0


def test_avoided_increases_with_every_extra_passenger() -> None:
    values = [co2_avoided(DISTANCE_KM, 7.1, "petrol", p) for p in range(5)]
    assert values == sorted(values)
    assert len(set(values)) == len(values)


def test_electric_earns_the_most_despite_emitting_nothing() -> None:
    """Defect 1 in changes.md 1.4: under the superseded formula an EV's
    co2_solo of 0 made co2_saved 0, so the greenest driver earned nothing."""
    tesla = co2_avoided(DISTANCE_KM, 15.8, "electric", 2)
    f150 = co2_avoided(DISTANCE_KM, 10.8, "diesel", 2)

    assert co2_solo(DISTANCE_KM, 15.8, "electric") == 0.0
    assert tesla > f150 > 0


def test_thirstier_cars_earn_less_not_more() -> None:
    """Defect 2 in changes.md 1.4, the incentive pointing the wrong way."""
    avoided = [co2_avoided(DISTANCE_KM, c, f, 2) for _, c, f, _, _ in FLEET_TABLE]
    assert avoided == sorted(avoided, reverse=True)


def test_solo_and_avoided_are_not_the_same_function() -> None:
    """Fails loudly if someone collapses the dashboard and rewards formulas
    back into one, which is the bug changes.md 1 exists to prevent. The Tesla
    is the sharpest case: it emits nothing and avoids the most."""
    assert co2_solo(DISTANCE_KM, 15.8, "electric") == 0.0
    assert co2_avoided(DISTANCE_KM, 15.8, "electric", 2) > 9.0


def test_the_clamp_holds_for_an_implausibly_thirsty_car() -> None:
    """Above 22.2 L/100km at one passenger the raw formula goes negative.
    23.1 is the thirstiest row in vehicle_reference, a Lamborghini Aventador."""
    assert co2_avoided(DISTANCE_KM, 23.1, "petrol", 1) == 0.0
    # A second passenger lifts the threshold to 33.3, so the same car clears it.
    assert co2_avoided(DISTANCE_KM, 23.1, "petrol", 2) > 0.0


def test_rideshare_divides_by_occupants_driver_included() -> None:
    solo = co2_solo(DISTANCE_KM, 7.1, "petrol")
    assert co2_rideshare(DISTANCE_KM, 7.1, "petrol", 3) == pytest.approx(solo / 3)


def test_rideshare_rejects_a_car_with_nobody_in_it() -> None:
    with pytest.raises(ValueError, match="at least one occupant"):
        co2_rideshare(DISTANCE_KM, 7.1, "petrol", 0)


def test_transit_sums_over_legs_and_tram_is_free() -> None:
    legs = [TransitLeg("train", 10.0), TransitLeg("bus", 2.0), TransitLeg("tram", 4.0)]
    assert co2_transit(legs) == pytest.approx(10 * 0.038 + 2 * 0.077)


def test_transit_tolerates_walking_legs() -> None:
    """Google Maps routes open and close with a walk. A missing 'walk' factor
    would raise KeyError on the first real route Sprint 5 caches."""
    assert co2_transit([TransitLeg("walk", 0.8)]) == 0.0
    assert co2_transit([]) == 0.0


def test_transit_rejects_an_unknown_mode() -> None:
    """Better a loud KeyError than a silently under-reported train leg."""
    with pytest.raises(KeyError):
        co2_transit([TransitLeg("ferry", 5.0)])  # type: ignore[arg-type]
