"""The read-through cache contract, against in-memory fakes.

The point of these tests is what does *not* happen: a cache hit must not call
Google. Every path to a route runs through a paid external call, so "did we
call it?" is the behaviour worth pinning down, and the fake maps module records
every call it receives.

The payloads are the recorded fixtures from tests/fixtures/routes/, so the real
transform runs inside these tests. Only the two edges, database and HTTP, are
faked.
"""

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, cast
from uuid import uuid4

import httpx
import pytest

from app.core.constants import TRANSIT_CACHE_TTL
from app.exceptions.errors import NotFoundError, UpstreamServiceError
from app.schemas.enums import Campus, TravelMode
from app.schemas.route import CampusRoute, CampusRouteCreate
from app.services import route_service
from supabase import Client

# the fakes never touch either, so there is nothing real to pass
DB = cast(Client, None)
HTTP = cast(httpx.Client, None)

FIXTURE_DIR = Path(__file__).resolve().parents[1] / "fixtures" / "routes"


def fixture(travel_mode: TravelMode) -> dict[str, Any]:
    payload: dict[str, Any] = json.loads(
        (FIXTURE_DIR / f"clayton_caulfield_{travel_mode}.json").read_text()
    )
    return payload


def cached_row(travel_mode: TravelMode, *, age: timedelta) -> CampusRoute:
    """A row already in the cache, aged by hand."""
    legs = (
        None
        if travel_mode == "drive"
        else [{"mode": "train", "distance_km": 10.0, "duration_min": 20, "line": "Cranbourne"}]
    )
    return CampusRoute(
        id=uuid4(),
        origin="clayton",
        destination="caulfield",
        travel_mode=travel_mode,
        distance_km=20.0,
        duration_min=30,
        route_summary="the cached one",
        legs=legs,
        cached_at=datetime.now(UTC) - age,
    )


class FakeRouteRepo:
    def __init__(self, row: CampusRoute | None = None) -> None:
        self.row = row
        self.upserts: list[CampusRouteCreate] = []

    def get(
        self, db: object, *, origin: Campus, destination: Campus, travel_mode: TravelMode
    ) -> CampusRoute | None:
        if self.row is None:
            return None
        matches = (
            self.row.origin == origin
            and self.row.destination == destination
            and self.row.travel_mode == travel_mode
        )
        return self.row if matches else None

    def upsert(self, db: object, *, route: CampusRouteCreate) -> CampusRoute:
        self.upserts.append(route)
        # the real repository stamps cached_at itself; that it does so is a
        # database-level fact, asserted in the repository's own comment rather
        # than here, where a fake asserting a fake would prove nothing
        stored = CampusRoute(id=uuid4(), cached_at=datetime.now(UTC), **route.model_dump())
        self.row = stored
        return stored


class FakeMaps:
    """Stands in for app.clients.maps. Records calls; optionally fails."""

    def __init__(self, *, fails: bool = False) -> None:
        self.fails = fails
        self.calls: list[tuple[Campus, Campus, TravelMode]] = []

    def compute_route(
        self,
        client: object,
        origin: Campus,
        destination: Campus,
        travel_mode: TravelMode,
        departure_at: datetime | None = None,
    ) -> dict[str, Any]:
        self.calls.append((origin, destination, travel_mode))
        if self.fails:
            raise UpstreamServiceError("google is down")
        return fixture(travel_mode)


def install(
    monkeypatch: pytest.MonkeyPatch,
    *,
    row: CampusRoute | None = None,
    fails: bool = False,
) -> tuple[FakeRouteRepo, FakeMaps]:
    repo = FakeRouteRepo(row)
    maps = FakeMaps(fails=fails)
    monkeypatch.setattr(route_service, "route_repository", repo)
    monkeypatch.setattr(route_service, "maps", maps)
    return repo, maps


def get(travel_mode: TravelMode) -> CampusRoute:
    return route_service.get_route(
        DB, HTTP, origin="clayton", destination="caulfield", travel_mode=travel_mode
    )


# --- cache hits ----------------------------------------------------------


def test_a_fresh_transit_row_is_served_without_calling_google(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repo, maps = install(monkeypatch, row=cached_row("transit", age=timedelta(minutes=5)))
    route = get("transit")
    assert route.route_summary == "the cached one"
    assert maps.calls == []
    assert repo.upserts == []


def test_a_drive_row_never_expires(monkeypatch: pytest.MonkeyPatch) -> None:
    """Road distance between two campuses does not change, so refetching it
    forever buys nothing. A year old is still a hit."""
    _, maps = install(monkeypatch, row=cached_row("drive", age=timedelta(days=365)))
    route = get("drive")
    assert route.route_summary == "the cached one"
    assert maps.calls == []


def test_a_transit_row_inside_the_ttl_is_still_fresh(monkeypatch: pytest.MonkeyPatch) -> None:
    _, maps = install(
        monkeypatch, row=cached_row("transit", age=TRANSIT_CACHE_TTL - timedelta(minutes=1))
    )
    get("transit")
    assert maps.calls == []


# --- cache misses --------------------------------------------------------


def test_a_missing_row_is_fetched_and_written_back(monkeypatch: pytest.MonkeyPatch) -> None:
    repo, maps = install(monkeypatch, row=None)
    route = get("transit")
    assert maps.calls == [("clayton", "caulfield", "transit")]
    assert len(repo.upserts) == 1
    # came from the fixture, through the real transform
    assert route.route_summary == "Bus 691 → Bus 900"
    assert route.distance_km == pytest.approx(28.375)


def test_an_expired_transit_row_is_refetched(monkeypatch: pytest.MonkeyPatch) -> None:
    repo, maps = install(
        monkeypatch, row=cached_row("transit", age=TRANSIT_CACHE_TTL + timedelta(minutes=1))
    )
    route = get("transit")
    assert maps.calls == [("clayton", "caulfield", "transit")]
    assert len(repo.upserts) == 1
    assert route.route_summary != "the cached one"


def test_a_row_for_another_pair_does_not_satisfy_the_query(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Routes are directional and per mode; a near miss must not be served."""
    other = cached_row("transit", age=timedelta(minutes=1)).model_copy(
        update={"destination": "peninsula"}
    )
    _, maps = install(monkeypatch, row=other)
    get("transit")
    assert maps.calls == [("clayton", "caulfield", "transit")]


# --- when Google is down -------------------------------------------------


def test_a_stale_row_is_served_when_the_fetch_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    """With a live call on the request path, an outage or a tripped quota
    would otherwise take POST /rides and the whole dashboard down. A
    two-day-old transit time beats a 502."""
    repo, maps = install(
        monkeypatch, row=cached_row("transit", age=TRANSIT_CACHE_TTL * 2), fails=True
    )
    route = get("transit")
    assert maps.calls == [("clayton", "caulfield", "transit")]
    assert route.route_summary == "the cached one"
    assert repo.upserts == []


def test_a_failed_fetch_with_no_row_at_all_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    install(monkeypatch, row=None, fails=True)
    with pytest.raises(NotFoundError):
        get("transit")
