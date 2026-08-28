"""Points conversion and pet progression. The thresholds here are the
recalibrated ones from changes.md 2, not the proposal's originals.
"""

import pytest

from app.core.emissions import co2_avoided
from app.core.points import pet_stage_for, points_earned
from app.schemas.enums import PetStage

DISTANCE_KM = 18.0


def test_points_are_floored_hundredths_of_a_kilogram() -> None:
    assert points_earned(7.26264) == 726
    assert points_earned(0.0) == 0
    assert points_earned(0.009) == 0


def test_points_never_go_negative() -> None:
    """co2_avoided already clamps, but floor(-0.001 * 100) is -1 and negative
    green_points would be a hole in the shop."""
    assert points_earned(-0.001) == 0


@pytest.mark.parametrize(
    ("consumption", "fuel_type", "expected"),
    [
        (15.8, "electric", 923),
        (4.9, "hybrid", 787),
        (7.1, "petrol", 726),
        (8.05, "petrol", 699),
        (11.3, "petrol", 609),
        (10.8, "diesel", 570),
    ],
)
def test_the_changes_md_points_column(consumption: float, fuel_type: str, expected: int) -> None:
    """End to end through both modules, against changes.md 1.5."""
    assert points_earned(co2_avoided(DISTANCE_KM, consumption, fuel_type, 2)) == expected  # type: ignore[arg-type]


def test_the_corolla_occupancy_progression() -> None:
    """changes.md 1.5 point 4 prints [0, 314, 726, 1163, 1610]. The formula
    gives [0, 313, 726, 1163, 1609]; the doc's two odd values come from
    rounding co2_solo to two decimals before subtracting. The doc is wrong and
    is on the fix list - assert the formula."""
    progression = [points_earned(co2_avoided(DISTANCE_KM, 7.1, "petrol", p)) for p in range(5)]
    assert progression == [0, 313, 726, 1163, 1609]


@pytest.mark.parametrize(
    ("total_kg", "expected"),
    [
        (0.0, "egg"),
        (14.99, "egg"),
        (15.0, "hatched"),
        (59.99, "hatched"),
        (60.0, "juvenile"),
        (199.99, "juvenile"),
        (200.0, "adult"),
        (799.99, "adult"),
        (800.0, "legendary"),
        (100_000.0, "legendary"),
    ],
)
def test_pet_stage_boundaries(total_kg: float, expected: PetStage) -> None:
    """Thresholds are inclusive: clearing exactly 15 kg hatches the egg."""
    assert pet_stage_for(total_kg) == expected


def test_a_pet_never_regresses_on_a_negative_total() -> None:
    assert pet_stage_for(-1.0) == "egg"


def test_roughly_three_rides_to_hatch() -> None:
    """The pacing changes.md 2 was written to achieve: early feedback in the
    first week, not instant progression. A typical ride is 7.26 kg."""
    typical = co2_avoided(DISTANCE_KM, 7.1, "petrol", 2)
    assert pet_stage_for(typical * 2) == "egg"
    assert pet_stage_for(typical * 3) == "hatched"
