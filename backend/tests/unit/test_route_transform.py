"""route_transform, asserted against recorded Routes API responses.

The fixtures in tests/fixtures/routes/ were recorded once by hand from the live
API: Clayton -> Caulfield, departing Monday 31 August 2026 08:00 Melbourne. No
test here ever calls Google. The call is the part that is slow, paid for and
needs a key; the part that is actually risky to get wrong is turning its
response into a campus_routes row, and that is what these tests exercise.

Re-record with scripts/warm_route_cache.py --save-fixtures if the API shape
changes. The numbers below come from the fixtures, so a re-recording will move
them, and that is a real signal rather than noise.
"""

import json
from pathlib import Path
from typing import Any

import pytest

from app.exceptions.errors import UpstreamServiceError
from app.services.route_transform import to_campus_route

FIXTURE_DIR = Path(__file__).resolve().parents[1] / "fixtures" / "routes"


def load_fixture(name: str) -> dict[str, Any]:
    payload: dict[str, Any] = json.loads((FIXTURE_DIR / f"{name}.json").read_text())
    return payload


@pytest.fixture
def drive_payload() -> dict[str, Any]:
    return load_fixture("clayton_caulfield_drive")


@pytest.fixture
def transit_payload() -> dict[str, Any]:
    return load_fixture("clayton_caulfield_transit")


def transit_step(vehicle_type: str, *, name_short: str | None = "42") -> dict[str, Any]:
    """a minimal TRANSIT step, for the vehicle types the fixture happens not to
    contain. Clayton -> Caulfield at 8am is buses; trains and trams still have
    to map correctly."""
    line: dict[str, Any] = {"vehicle": {"type": vehicle_type}}
    if name_short is not None:
        line["nameShort"] = name_short
    return {
        "travelMode": "TRANSIT",
        "distanceMeters": 5000,
        "staticDuration": "600s",
        "transitDetails": {"transitLine": line},
    }


def transit_payload_of(*steps: dict[str, Any]) -> dict[str, Any]:
    return {"routes": [{"distanceMeters": 5000, "duration": "600s", "legs": [{"steps": steps}]}]}


# --- drive ---------------------------------------------------------------


def test_drive_route_maps_onto_a_row(drive_payload: dict[str, Any]) -> None:
    route = to_campus_route(
        drive_payload, origin="clayton", destination="caulfield", travel_mode="drive"
    )
    assert route.origin == "clayton"
    assert route.destination == "caulfield"
    assert route.travel_mode == "drive"
    assert route.distance_km == pytest.approx(23.24)  # 23240 m
    assert route.duration_min == 27  # 1604 s
    assert route.route_summary == "Wellington Rd and M1"


def test_a_drive_route_has_no_legs(drive_payload: dict[str, Any]) -> None:
    """CLAUDE.md, campus_routes: legs is NULL for drive rows. The field mask
    does not even ask Google for steps on a drive request."""
    route = to_campus_route(
        drive_payload, origin="clayton", destination="caulfield", travel_mode="drive"
    )
    assert route.legs is None


# --- transit -------------------------------------------------------------


def test_transit_route_totals(transit_payload: dict[str, Any]) -> None:
    route = to_campus_route(
        transit_payload, origin="clayton", destination="caulfield", travel_mode="transit"
    )
    assert route.distance_km == pytest.approx(28.375)  # 28375 m
    assert route.duration_min == 101  # 6085 s


def test_consecutive_walk_steps_are_merged(transit_payload: dict[str, Any]) -> None:
    """The recorded response opens with six separate WALK steps of 387, 201,
    102, 268, 150 and 121 m. Stored as six legs they would be noise; the
    passenger walked once, for 1.229 km."""
    route = to_campus_route(
        transit_payload, origin="clayton", destination="caulfield", travel_mode="transit"
    )
    assert route.legs is not None
    assert [leg.mode for leg in route.legs] == ["walk", "bus", "bus", "walk"]

    first_walk = route.legs[0]
    assert first_walk.distance_km == pytest.approx(1.229)
    assert first_walk.duration_min == 16  # 943 s
    assert first_walk.line is None


def test_transit_line_names_are_preserved(transit_payload: dict[str, Any]) -> None:
    route = to_campus_route(
        transit_payload, origin="clayton", destination="caulfield", travel_mode="transit"
    )
    assert route.legs is not None
    assert [leg.line for leg in route.legs] == [None, "691", "900", None]


def test_transit_summary_names_the_services(transit_payload: dict[str, Any]) -> None:
    """Google sends no `description` for a transit route, so the summary has to
    be built from the services taken."""
    route = to_campus_route(
        transit_payload, origin="clayton", destination="caulfield", travel_mode="transit"
    )
    assert route.route_summary is not None
    assert "691" in route.route_summary
    assert "900" in route.route_summary


def test_legs_account_for_the_whole_journey(transit_payload: dict[str, Any]) -> None:
    """Emissions are summed over legs, so a leg lost in the merge is emissions
    silently under-reported."""
    route = to_campus_route(
        transit_payload, origin="clayton", destination="caulfield", travel_mode="transit"
    )
    assert route.legs is not None
    assert route.distance_km is not None
    assert sum(leg.distance_km for leg in route.legs) == pytest.approx(route.distance_km)


@pytest.mark.parametrize(
    ("vehicle_type", "expected"),
    [
        ("BUS", "bus"),
        ("HEAVY_RAIL", "train"),
        ("RAIL", "train"),
        ("TRAM", "tram"),
        ("LIGHT_RAIL", "tram"),
    ],
)
def test_vehicle_types_map_onto_transit_modes(vehicle_type: str, expected: str) -> None:
    route = to_campus_route(
        transit_payload_of(transit_step(vehicle_type)),
        origin="clayton",
        destination="caulfield",
        travel_mode="transit",
    )
    assert route.legs is not None
    assert route.legs[0].mode == expected


def test_an_unmapped_vehicle_type_is_refused() -> None:
    """Guessing would put a ferry on the tram emission factor, which is zero.
    Better a 502 than a quietly wrong number."""
    with pytest.raises(UpstreamServiceError):
        to_campus_route(
            transit_payload_of(transit_step("FERRY")),
            origin="clayton",
            destination="caulfield",
            travel_mode="transit",
        )


def test_a_line_without_a_short_name_falls_back_to_its_full_name() -> None:
    """Metro trains have no nameShort: the Cranbourne line is `name` only."""
    step = transit_step("HEAVY_RAIL", name_short=None)
    step["transitDetails"]["transitLine"]["name"] = "Cranbourne"
    route = to_campus_route(
        transit_payload_of(step),
        origin="clayton",
        destination="caulfield",
        travel_mode="transit",
    )
    assert route.legs is not None
    assert route.legs[0].line == "Cranbourne"


def test_a_response_with_no_routes_is_refused() -> None:
    with pytest.raises(UpstreamServiceError):
        to_campus_route(
            {"routes": []}, origin="clayton", destination="caulfield", travel_mode="drive"
        )
