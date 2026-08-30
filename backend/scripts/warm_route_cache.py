"""Seed script for all drive routes between each pair of campuses.

Run once: POST /rides reads distance_km from campus_routes, and an empty table
means every ride creation makes a live Google call and fails outright when
Google is unreachable. Drive rows never expire, so a second run calls nothing.

    uv run python -m scripts.warm_route_cache

The printed distances are the point. A pair that comes back far shorter than
its neighbours means a campus address in app/clients/maps.py geocoded to the
wrong building, and no test can catch that for you.
"""

import sys
from itertools import permutations

import httpx

from app.clients.maps import get_maps_client
from app.core.config import get_settings
from app.exceptions.errors import DomainError
from app.schemas.enums import Campus, TravelMode
from app.services.route_service import get_route
from supabase import Client, create_client

CAMPUSES: list[Campus] = ["clayton", "caulfield", "peninsula", "parkville", "city"]
pairs = list(permutations(CAMPUSES, 2))


def get_client() -> Client:
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_key.get_secret_value())


def seed_routes(db: Client, http: httpx.Client, mode: TravelMode = "drive") -> list[str]:
    """Fetch and cache every pair, returning the ones that failed.

    One unroutable pair must not take the other nineteen with it: the whole
    point of a warming run is to find out which pairs are broken, and stopping
    at the first means paying for the calls already made and learning nothing
    about the rest.
    """
    failures: list[str] = []

    for index, (src, dst) in enumerate(pairs, start=1):
        label = f"{src} -> {dst}"
        try:
            route = get_route(db, http, origin=src, destination=dst, travel_mode=mode)
        except DomainError as exc:
            failures.append(label)
            print(f"  [{index:>2}/{len(pairs)}] {label:<24} FAILED  {exc.detail}", file=sys.stderr)
            continue

        summary = route.route_summary or "no summary"
        print(
            f"  [{index:>2}/{len(pairs)}] {label:<24}"
            f" {route.distance_km:6.2f} km {route.duration_min:>4} min  {summary}"
        )

    return failures


def main() -> None:
    mode: TravelMode = "drive"
    print(f"Warming {len(pairs)} {mode} routes")

    db = get_client()
    http = get_maps_client()
    try:
        failures = seed_routes(db, http, mode)
    finally:
        http.close()

    print(f"\n  cached {len(pairs) - len(failures)} / {len(pairs)}")
    if failures:
        # a script that reports failures on stdout and exits 0 is a script
        # whose failures get missed
        print(f"  FAIL: {len(failures)} unroutable: {', '.join(failures)}", file=sys.stderr)
        raise SystemExit(1)
    print("\nDone")


if __name__ == "__main__":
    main()
