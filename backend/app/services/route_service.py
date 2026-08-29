"""Read-through cache over campus_routes.

The flow: ask the cache, return the row if it is fresh, otherwise fetch from
Google, transform, write back, return.

Populating lazily rather than pre-seeding is what makes the TTL mean anything:
a pre-seeded cache that nothing ever refreshes cannot expire.
"""

from datetime import UTC, datetime

import httpx

from app.clients import maps
from app.core.constants import TRANSIT_CACHE_TTL
from app.exceptions.errors import NotFoundError, UpstreamServiceError
from app.repositories import route_repository
from app.schemas.enums import Campus, TravelMode
from app.schemas.route import CampusRoute
from app.services.route_transform import to_campus_route
from supabase import Client


def is_fresh(route: CampusRoute, *, now: datetime | None = None) -> bool:
    """Freshness is not uniform.

    A drive row never expires: the road distance between two campuses does not
    change, and its duration is deliberately traffic-unaware, so a refetch
    would return the same figures at the cost of another call.

    A transit row expires after TRANSIT_CACHE_TTL, which only has to pick up
    timetable revisions: every fetch asks for the same canonical journey, so
    two lookups on the same day would get the same answer anyway.
    """
    if route.travel_mode == "drive":
        return True
    current = now or datetime.now(UTC)
    # cached_at comes back from a TIMESTAMPTZ column, so it is timezone-aware
    return current - route.cached_at < TRANSIT_CACHE_TTL


def get_route(
    db: Client,
    http: httpx.Client,
    *,
    origin: Campus,
    destination: Campus,
    travel_mode: TravelMode,
) -> CampusRoute:
    """The cached route for this pair and mode, fetching it if need be.

    Two concurrent misses on the same pair will make two calls and two upserts.
    The unique constraint on (origin, destination, travel_mode) makes that safe
    and merely wasteful, and at five campuses it is not worth locking for. It
    is not a bug.
    """
    cached = route_repository.get(
        db, origin=origin, destination=destination, travel_mode=travel_mode
    )
    if cached is not None and is_fresh(cached):
        return cached

    try:
        payload = maps.compute_route(http, origin, destination, travel_mode)
        fetched = to_campus_route(
            payload, origin=origin, destination=destination, travel_mode=travel_mode
        )
    except UpstreamServiceError:
        # Serving stale is deliberate. With a live call on the request path, an
        # outage or a tripped quota would otherwise take POST /rides and the
        # comparison dashboard down entirely; an out-of-date transit time is a
        # far smaller harm than an unusable app.
        if cached is not None:
            return cached
        raise NotFoundError(f"no route available from {origin} to {destination}") from None

    return route_repository.upsert(db, route=fetched)
