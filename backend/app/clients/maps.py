"""Google Maps Routes API client.

The only module that speaks HTTP to Google. A service must not make the call
itself, and nothing above this layer needs to know what a field mask is.

Two rules live here, both deliberate.

Departure time. A transit route only means something for a specific departure,
and campus_routes holds one row per (origin, destination, transit). Every
transit fetch therefore asks for the same canonical journey, the next weekday at
08:00 Melbourne time, so the cached figures are reproducible: two students
comparing the same ride hours apart see the same number. Predictably wrong for
an off-peak trip beats unpredictably wrong for everyone.

Traffic. A drive row is cached permanently, so a traffic-aware duration would
freeze one afternoon's congestion into the row forever. Drive requests are
TRAFFIC_UNAWARE and send no departure time: a stable free-flow duration, which
is honestly a floor rather than a peak-hour promise.
"""

from datetime import UTC, datetime, time, timedelta
from functools import lru_cache
from typing import Any
from zoneinfo import ZoneInfo

import httpx

from app.core.config import get_settings
from app.exceptions.errors import UpstreamServiceError
from app.schemas.enums import Campus, TravelMode

ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"

MELBOURNE = ZoneInfo("Australia/Melbourne")
CANONICAL_DEPARTURE_HOUR = 8
SATURDAY = 5

REQUEST_TIMEOUT_SECONDS = 10.0

# Free-text addresses rather than place IDs: readable in a diff, and a campus
# does not move. If Google ever geocodes one of these to the wrong building the
# fix is here, in one place.
CAMPUS_ADDRESSES: dict[Campus, str] = {
    "clayton": "Monash University Clayton Campus, Wellington Rd, Clayton VIC 3800, Australia",
    "caulfield": (
        "Monash University Caulfield Campus, 900 Dandenong Rd, Caulfield East VIC 3145, Australia"
    ),
    "peninsula": ("Monash University Peninsula Campus, McMahons Rd, Frankston VIC 3199, Australia"),
    "parkville": (
        "Monash University Parkville Campus, 381 Royal Parade, Parkville VIC 3052, Australia"
    ),
    "city": "Monash University City Campus, 750 Collins St, Docklands VIC 3008, Australia",
}

# The Routes API bills by the fields you ask for and returns nothing you did not
# ask for, so these masks are load-bearing: drop a field here and the transform
# sees a hole. Transit needs the per-step breakdown because emissions are summed
# over legs.
_TRANSIT_STEP_FIELDS = (
    "routes.legs.steps.travelMode,"
    "routes.legs.steps.distanceMeters,"
    "routes.legs.steps.staticDuration,"
    "routes.legs.steps.transitDetails"
)
FIELD_MASKS: dict[TravelMode, str] = {
    "drive": "routes.duration,routes.distanceMeters,routes.description",
    "transit": f"routes.duration,routes.distanceMeters,routes.description,{_TRANSIT_STEP_FIELDS}",
}


@lru_cache
def get_maps_client() -> httpx.Client:
    """One client per process, for the same reason as get_supabase().

    The client owns a connection pool; building one per request throws away the
    pool and pays for a fresh TLS handshake every time.
    """
    return httpx.Client(timeout=REQUEST_TIMEOUT_SECONDS)


def next_weekday_0800(now: datetime | None = None) -> datetime:
    """The canonical departure: the next weekday at 08:00, Melbourne time.

    Always tomorrow or later, never today, so the answer does not change
    depending on whether the cache miss happened at 07:00 or 09:00, and is
    always safely in the future (the Routes API rejects a past departureTime).

    `now` is injectable so this is testable without freezing the clock.
    """
    current = (now or datetime.now(MELBOURNE)).astimezone(MELBOURNE)
    candidate = datetime.combine(
        current.date() + timedelta(days=1),
        time(hour=CANONICAL_DEPARTURE_HOUR),
        tzinfo=MELBOURNE,
    )
    # weekday(): Monday is 0, so 5 and 6 are the weekend. Timetables differ
    # enough on a weekend that a Saturday service would misrepresent a commute.
    while candidate.weekday() >= SATURDAY:
        candidate += timedelta(days=1)
    return candidate


def build_request_body(
    origin: Campus,
    destination: Campus,
    travel_mode: TravelMode,
    departure_at: datetime | None = None,
) -> dict[str, Any]:
    """The computeRoutes request body. Pure, so it can be asserted on directly."""
    body: dict[str, Any] = {
        "origin": {"address": CAMPUS_ADDRESSES[origin]},
        "destination": {"address": CAMPUS_ADDRESSES[destination]},
        "travelMode": "DRIVE" if travel_mode == "drive" else "TRANSIT",
        "computeAlternativeRoutes": False,
        "languageCode": "en-AU",
        "units": "METRIC",
    }
    if travel_mode == "drive":
        body["routingPreference"] = "TRAFFIC_UNAWARE"
    else:
        departure = departure_at or next_weekday_0800()
        # RFC 3339 in UTC; Google rejects the "+00:00" spelling of the zone
        body["departureTime"] = departure.astimezone(UTC).isoformat().replace("+00:00", "Z")
    return body


def compute_route(
    client: httpx.Client,
    origin: Campus,
    destination: Campus,
    travel_mode: TravelMode,
    departure_at: datetime | None = None,
) -> dict[str, Any]:
    """Call computeRoutes and hand back the raw response.

    Deliberately returns the untouched dict: reshaping it is route_transform's
    job, and keeping the two apart is what lets the transform be tested against
    a recorded fixture without any network.
    """
    settings = get_settings()
    headers = {
        "Content-Type": "application/json",
        # the key travels in a header, never the URL, so it stays out of logs
        "X-Goog-Api-Key": settings.google_maps_api_key.get_secret_value(),
        "X-Goog-FieldMask": FIELD_MASKS[travel_mode],
    }
    body = build_request_body(origin, destination, travel_mode, departure_at)

    try:
        response = client.post(ROUTES_URL, json=body, headers=headers)
        response.raise_for_status()
    except httpx.HTTPError as exc:
        # route_service turns this into "serve the stale row if we have one"
        raise UpstreamServiceError(f"routes api request failed: {exc}") from exc

    payload: dict[str, Any] = response.json()
    # An empty routes list is a 200. Between two fixed campus addresses it means
    # the upstream failed us, not that no route exists.
    if not payload.get("routes"):
        raise UpstreamServiceError(f"routes api returned no route for {origin} to {destination}")
    return payload
