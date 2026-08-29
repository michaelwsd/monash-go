"""Google's computeRoutes response -> a campus_routes row.

Pure: a dict in, a CampusRouteCreate out. No HTTP, no database, no clock. That
is what lets it be tested against a recorded fixture rather than a live call,
and the call is the part that is slow, paid for and needs a key.

It lives under app/ rather than scripts/ because the running application needs
it: a lazy cache miss transforms a live response on a request path.
"""

from dataclasses import dataclass
from typing import Any

from app.exceptions.errors import UpstreamServiceError
from app.schemas.enums import Campus, TransitMode, TravelMode
from app.schemas.route import CampusRouteCreate, TransitLeg

# Only the vehicle types Melbourne actually runs. Anything else is refused
# rather than guessed: a ferry mapped onto tram would be costed at 0.0 kg/km,
# which is a wrong number that looks like a right one. Adding a mode is one
# line here plus a factor in core/constants.TRANSIT_FACTORS.
VEHICLE_TYPE_TO_MODE: dict[str, TransitMode] = {
    "BUS": "bus",
    "HEAVY_RAIL": "train",
    "RAIL": "train",
    "TRAM": "tram",
    "LIGHT_RAIL": "tram",
}

SECONDS_PER_MINUTE = 60


@dataclass
class _PartialLeg:
    """A leg still being accumulated. Walk steps merge into one of these, so
    metres and seconds stay exact until the very end; rounding each of six
    walk steps to minutes and then adding them loses up to three minutes."""

    mode: TransitMode
    metres: int
    seconds: int
    line: str | None


def _duration_seconds(raw: object) -> int:
    """Google sends durations as a protobuf Duration string: "1604s"."""
    if not isinstance(raw, str) or not raw.endswith("s"):
        raise UpstreamServiceError(f"routes api sent an unreadable duration: {raw!r}")
    try:
        return round(float(raw[:-1]))
    except ValueError as exc:
        raise UpstreamServiceError(f"routes api sent an unreadable duration: {raw!r}") from exc


def _to_minutes(seconds: int) -> int:
    return round(seconds / SECONDS_PER_MINUTE)


def _metres(step: dict[str, Any]) -> int:
    # A step short enough to round to zero metres still has a travelMode and
    # still belongs in the journey, so a missing key defaults rather than fails.
    return int(step.get("distanceMeters", 0))


def _line_label(transit_line: dict[str, Any]) -> str | None:
    """The service as a passenger would name it.

    nameShort is the route number a bus is known by ("900"). Metro trains have
    no nameShort at all, only name ("Cranbourne"), so fall back to it.
    """
    short = transit_line.get("nameShort")
    if isinstance(short, str) and short:
        return short
    full = transit_line.get("name")
    return full if isinstance(full, str) and full else None


def _transit_mode(step: dict[str, Any]) -> tuple[TransitMode, str | None]:
    transit_line = step.get("transitDetails", {}).get("transitLine", {})
    vehicle_type = transit_line.get("vehicle", {}).get("type")
    mode = VEHICLE_TYPE_TO_MODE.get(vehicle_type)
    if mode is None:
        raise UpstreamServiceError(f"routes api sent an unmapped transit vehicle: {vehicle_type!r}")
    return mode, _line_label(transit_line)


def _build_legs(steps: list[dict[str, Any]]) -> list[TransitLeg]:
    """Steps -> legs, merging runs of walking.

    A real journey opens with several consecutive WALK steps, one per turn of
    the footpath ("head north", "turn left"). The passenger experiences one
    walk, so store one leg. Transit steps never merge, even two of the same
    line: changing service is the thing a passenger cares about.
    """
    partials: list[_PartialLeg] = []

    for step in steps:
        travel_mode = step.get("travelMode")
        seconds = _duration_seconds(step.get("staticDuration"))
        metres = _metres(step)

        if travel_mode == "WALK":
            if partials and partials[-1].mode == "walk":
                partials[-1].metres += metres
                partials[-1].seconds += seconds
                continue
            partials.append(_PartialLeg("walk", metres, seconds, None))
        elif travel_mode == "TRANSIT":
            mode, line = _transit_mode(step)
            partials.append(_PartialLeg(mode, metres, seconds, line))
        else:
            raise UpstreamServiceError(f"routes api sent an unknown step mode: {travel_mode!r}")

    return [
        TransitLeg(
            mode=partial.mode,
            distance_km=partial.metres / 1000,
            duration_min=_to_minutes(partial.seconds),
            line=partial.line,
        )
        for partial in partials
    ]


def _transit_summary(legs: list[TransitLeg]) -> str:
    """Google sends no `description` for a transit route, so name the services
    taken: "Bus 691 → Bus 900". Walk legs are left out; every journey starts
    and ends with one and saying so tells the reader nothing."""
    labels = [f"{leg.mode.title()} {leg.line}".strip() for leg in legs if leg.mode != "walk"]
    return " → ".join(labels) if labels else "Walk"


def _first_route(payload: dict[str, Any]) -> dict[str, Any]:
    routes = payload.get("routes") or []
    if not routes:
        raise UpstreamServiceError("routes api returned no route")
    # computeAlternativeRoutes is False, so there is exactly one
    first: dict[str, Any] = routes[0]
    return first


def _steps(route: dict[str, Any]) -> list[dict[str, Any]]:
    # One campus to another is a single leg in Google's sense (no waypoints);
    # its "legs" are not our legs, which are the steps within it.
    steps: list[dict[str, Any]] = []
    for google_leg in route.get("legs", []):
        steps.extend(google_leg.get("steps", []))
    return steps


def to_campus_route(
    payload: dict[str, Any],
    *,
    origin: Campus,
    destination: Campus,
    travel_mode: TravelMode,
) -> CampusRouteCreate:
    """Reshape one computeRoutes response into the row we cache."""
    route = _first_route(payload)

    distance_km = int(route.get("distanceMeters", 0)) / 1000
    duration_min = _to_minutes(_duration_seconds(route.get("duration")))

    if travel_mode == "drive":
        # `description` is Google's own summary of the roads taken, e.g.
        # "Wellington Rd and M1". Transit responses do not carry one.
        summary = route.get("description")
        return CampusRouteCreate(
            origin=origin,
            destination=destination,
            travel_mode="drive",
            distance_km=distance_km,
            duration_min=duration_min,
            route_summary=summary if isinstance(summary, str) else None,
            legs=None,
        )

    legs = _build_legs(_steps(route))
    if not legs:
        # The schema would refuse this anyway; saying why here beats a
        # ValidationError three frames down.
        raise UpstreamServiceError("routes api returned a transit route with no steps")

    return CampusRouteCreate(
        origin=origin,
        destination=destination,
        travel_mode="transit",
        distance_km=distance_km,
        duration_min=duration_min,
        route_summary=_transit_summary(legs),
        legs=legs,
    )
