"""fuel_transform, asserted against a recorded Servo Saver response.

tests/fixtures/servo_saver/prices.json is seven stations cut from a real
/fuel/prices response on 16 September 2026, shape untouched. The full response
is 1,757 stations and 2.4 MB; these seven keep every case the transform has to
handle. No test here calls the API.

The numbers below are read off the fixture by hand, so re-recording it moves
them - and that is a signal, not noise.
"""

import json
from pathlib import Path
from typing import Any

import pytest

from app.exceptions.errors import UpstreamServiceError
from app.services.fuel_transform import to_prices

FIXTURE = Path(__file__).resolve().parents[1] / "fixtures" / "servo_saver" / "prices.json"


@pytest.fixture
def payload() -> dict[str, Any]:
    data: dict[str, Any] = json.loads(FIXTURE.read_text())
    return data


def station(*prices: tuple[str, float | None, bool]) -> dict[str, Any]:
    """A minimal station, for cases the recorded seven do not contain."""
    return {
        "fuelStation": {"id": "x", "name": "x", "brandId": "x", "address": "x", "location": {}},
        "fuelPrices": [
            {"fuelType": code, "price": price, "isAvailable": available, "updatedAt": "x"}
            for code, price, available in prices
        ],
        "updatedAt": "x",
    }


def payload_of(*stations: dict[str, Any]) -> dict[str, Any]:
    return {"fuelPriceDetails": list(stations)}


# --- the recorded response ------------------------------------------------


def test_petrol_is_the_median_u91_in_dollars(payload: dict[str, Any]) -> None:
    """Seven U91 prices in the fixture: 205.5, 207.5, 207.5, 215.9, 215.9,
    223.9, 225.9 cents. The middle one is 215.9c, which is $2.159."""
    assert to_prices(payload)["petrol"] == pytest.approx(2.159)


def test_diesel_is_the_median_dsl(payload: dict[str, Any]) -> None:
    """Five DSL prices: 241.9, 248.5, 249.9, 262.9, 265.9. Middle is 249.9c."""
    assert to_prices(payload)["diesel"] == pytest.approx(2.499)


def test_hybrid_uses_the_petrol_price(payload: dict[str, Any]) -> None:
    """A hybrid burns petrol. Same price, same factor (CLAUDE.md)."""
    prices = to_prices(payload)
    assert prices["hybrid"] == prices["petrol"]


def test_electric_is_not_a_fuel_price(payload: dict[str, Any]) -> None:
    """EVs are costed on ELECTRICITY_PRICE from constants, never from here.
    Producing a petrol figure under 'electric' would be wrong by ten times."""
    assert "electric" not in to_prices(payload)


def test_only_the_three_fuel_types_come_out(payload: dict[str, Any]) -> None:
    """The fixture also carries P95, P98, PDSL and E10. None of those maps to
    anything a vehicle in this app is registered as."""
    assert set(to_prices(payload)) == {"petrol", "diesel", "hybrid"}


# --- what a real response can contain --------------------------------------


def test_a_null_price_is_skipped_not_zero() -> None:
    """price is nullable in the schema. Counting a null as 0 would drag the
    median down for every driver in the state."""
    prices = to_prices(
        payload_of(
            station(("U91", 200.0, True)),
            station(("U91", None, True)),
            station(("U91", 220.0, True)),
        )
    )
    assert prices["petrol"] == pytest.approx(2.10)


def test_an_unavailable_price_is_skipped() -> None:
    """isAvailable false means the pump is off. The number beside it may be
    days old, and it is not a price anyone can pay today."""
    prices = to_prices(
        payload_of(
            station(("U91", 200.0, True)),
            station(("U91", 900.0, False)),
            station(("U91", 220.0, True)),
        )
    )
    assert prices["petrol"] == pytest.approx(2.10)


def test_a_median_of_an_even_count_averages_the_middle_pair() -> None:
    prices = to_prices(
        payload_of(
            station(("U91", 200.0, True)),
            station(("U91", 210.0, True)),
            station(("U91", 230.0, True)),
            station(("U91", 300.0, True)),
        )
    )
    assert prices["petrol"] == pytest.approx(2.20)


def test_the_median_ignores_an_outlier_station() -> None:
    """The real response has a U91 station at 369.9c against a median of
    217.9c. A mean would move 9c on one pump; a median does not move at all."""
    normal = [station(("U91", 215.0, True)) for _ in range(9)]
    prices = to_prices(payload_of(*normal, station(("U91", 369.9, True))))
    assert prices["petrol"] == pytest.approx(2.15)


def test_a_fuel_type_with_no_usable_price_is_absent() -> None:
    """Diesel with every price null is not diesel at zero dollars. The caller
    decides what a missing price means; the transform must not invent one."""
    prices = to_prices(payload_of(station(("U91", 200.0, True), ("DSL", None, True))))
    assert "diesel" not in prices
    assert prices["petrol"] == pytest.approx(2.00)


def test_no_petrol_price_anywhere_is_an_upstream_error() -> None:
    """Every petrol and hybrid car in the app is costed on U91. A response with
    no usable U91 price is a broken feed, not a quiet day."""
    with pytest.raises(UpstreamServiceError):
        to_prices(payload_of(station(("LPG", 99.9, True))))


def test_an_empty_response_is_an_upstream_error() -> None:
    with pytest.raises(UpstreamServiceError):
        to_prices({"fuelPriceDetails": []})
