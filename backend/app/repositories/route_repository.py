"""Every campus_routes-table query."""

from datetime import UTC, datetime
from typing import Any

from app.schemas.enums import Campus, TravelMode
from app.schemas.route import CampusRoute, CampusRouteCreate
from supabase import Client

TABLE = "campus_routes"


def get(
    db: Client, *, origin: Campus, destination: Campus, travel_mode: TravelMode
) -> CampusRoute | None:
    """The cached row for one direction and one mode, if there is one.

    Directional on purpose: Clayton -> City and City -> Clayton are different
    rows, because timetables and interchanges differ by direction.
    """
    res = (
        db.table(TABLE)
        .select("*")
        .eq("origin", origin)
        .eq("destination", destination)
        .eq("travel_mode", travel_mode)
        .limit(1)
        .execute()
    )
    return CampusRoute.model_validate(res.data[0]) if res.data else None


def upsert(db: Client, *, route: CampusRouteCreate) -> CampusRoute:
    """Write a freshly fetched route, replacing any existing row for that pair.

    cached_at is set here rather than left to the column default, which only
    applies on insert. On the update half of an upsert the default never fires,
    so a refresh would leave the old timestamp and the row would stay
    permanently expired, refetching on every single request.
    """
    payload: dict[str, Any] = {
        "origin": route.origin,
        "destination": route.destination,
        "travel_mode": route.travel_mode,
        "distance_km": route.distance_km,
        "duration_min": route.duration_min,
        "route_summary": route.route_summary,
        # JSONB: a list of plain dicts, not pydantic objects
        "legs": [leg.model_dump() for leg in route.legs] if route.legs is not None else None,
        "cached_at": datetime.now(UTC).isoformat(),
    }
    res = db.table(TABLE).upsert(payload, on_conflict="origin,destination,travel_mode").execute()
    return CampusRoute.model_validate(res.data[0])
