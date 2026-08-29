# Sprint 3 — Route cache and rides

**Dates:** 11/09/26 – 25/09/26 (planned)
**Build order reference:** `build_plan.md` Step 5
**Builds toward:** REQ-002 (driver posts a ride), REQ-007 (campus route display, backend half)
**Depends on:** Sprint 2's vehicles (a ride needs a registered vehicle)

> **Design change, 29/08/26 — the route cache is read-through, not pre-seeded.**
> As originally written, this sprint pre-seeded all 40 rows with a script and had `route_service`
> read the cache only, never calling the API. That contradicts `proposal.md` §4.4 ("Before each
> lookup, the backend checks whether a valid cache entry exists; if so, it returns the cached
> result without calling the API") and leaves `CLAUDE.md`'s transit TTL unable to ever fire,
> because nothing would refresh it. The cache is now populated lazily: a route is fetched on first
> query and refetched when stale. Sections 1–2 and the definition of done are rewritten below.

## Goal

The core marketplace: drivers post ride offers, passengers can search them. This is also where
real distances enter the system for the first time — every emissions and cost figure downstream is
`distance_km × something`, and that distance comes from here.

## Test-driven build order

### 1. Route transform logic — test this before anything calls the API

Every path to a route runs through a paid external call, so that call cannot be the thing your
tests exercise. Isolate the part that is actually risky to get wrong: turning a Google Maps Routes
API response into the `campus_routes` row shape.

**Write first**, in `tests/unit/test_route_transform.py`, against a **recorded fixture** — call the
Routes API once by hand, save the JSON response as a test fixture, and never call the live API from
a test again:
- Each step's `travelMode` (`WALK` or `TRANSIT`) and `distanceMeters` map onto a leg correctly.
- For `TRANSIT` steps, the mode comes from `transitDetails.transitLine.vehicle.type` (`BUS`,
  `HEAVY_RAIL`, `TRAM`) and maps onto `TRANSIT_MODE` (`bus`, `train`, `tram`), with the line name
  from `transitDetails.transitLine.nameShort` preserved.
- Consecutive small `WALK` steps are aggregated into a single walk leg, not left as many tiny legs.
- The transform's output for a drive-mode route has `legs = NULL` (only transit rows populate legs,
  per `CLAUDE.md`'s `campus_routes` schema note).

**Then implement:**
- `app/schemas/route.py` — `CampusRoute` and a Pydantic `TransitLeg`. Note the name clash with
  `core/emissions.TransitLeg`, which is a `NamedTuple` so that `core/` stays free of Pydantic. Keep
  both and convert at the boundary; import one under an alias where they meet.
- `app/services/route_transform.py` — the pure transform, response dict → `CampusRoute`. It lives
  under `app/` and not `scripts/`, because the running application now needs it: a lazy cache miss
  transforms a live response on a request path.
- `app/clients/maps.py` — the `computeRoutes` call itself, returning the raw response dict. A new
  layer, sibling to `db/client.py`, because a service must not speak HTTP (`CLAUDE.md`, Backend
  Architecture). Campus addresses and the departure-time rule live here.
- `scripts/warm_route_cache.py` — optional. `--save-fixtures` records responses for the transform
  tests; `--drive-only` pre-fetches the 20 drive pairs so ride creation can never block on Google.
  Not a prerequisite for anything, and no longer seeds all 40 rows.

### 2. Route service — the read-through cache

The flow: query a route → return it if cached and fresh → otherwise fetch, write back, return.

Freshness is not uniform. A drive row **never expires**: the road distance between two campuses
does not change, and refetching it forever buys nothing (`CLAUDE.md`, "drive: permanent"). A
transit row expires after `TRANSIT_CACHE_TTL`, defined once in `core/constants.py` with its
reasoning — and whichever value is chosen, `CLAUDE.md` line 248 must be made to agree with it.

**Write first**, in `tests/unit/test_route_service.py`, with a fake repository and a Maps client
that raises on any attribute access:
- a fresh transit row is returned and the client is never called
- a drive row is never considered expired, however old its `cached_at`
- an expired transit row triggers a fetch, and the fetched row is written back
- a missing row triggers a fetch and a write
- a fetch that raises, with a stale row present, returns the stale row rather than failing
- a fetch that raises with no row at all raises `NotFoundError`
- the row written back carries a fresh `cached_at`

**Then implement:**
- `app/repositories/route_repository.py` — `get()` and `upsert()` on `campus_routes`. Upsert on the
  existing `UNIQUE (origin, destination, travel_mode)` constraint, and set `cached_at` explicitly
  rather than relying on the column default, or a refresh will not move it.
- `app/services/route_service.py` — the cache logic above, orchestrating repository, client and
  transform.

Serving stale on a failed fetch is deliberate: with a live call on the request path, a Maps outage
or a quota trip would otherwise take `POST /rides` and the Sprint 5 dashboard down entirely.

Two concurrent misses on the same pair will make two calls and two upserts. The unique constraint
makes that safe, only mildly wasteful, and it is not worth locking for at this scale — but say so
in a comment so nobody later mistakes it for a bug.

**Decision, 29/08/26 - a lazy transit fetch asks for the next weekday at 08:00, Melbourne time.**
A transit route is only meaningful for a specific departure time, and one row per
`(origin, destination, transit)` cannot hold both an 8am and an 11pm journey. Fetching with *now*
would leave the row holding whatever time the last cache miss happened at, so two students
comparing the same ride hours apart would see different figures, the same non-reproducibility
`sprint-5.md` guards against for fuel prices. A canonical departure is predictably wrong for
off-peak travel rather than unpredictably wrong for everyone, and it keeps one row per pair, so no
migration is needed now.

What follows from it:

- `app/clients/maps.py` owns the rule and nothing above it passes a departure time in. Expose the
  calculation as a pure helper, `next_weekday_0800(now)`, so it can be unit tested without HTTP:
  a Friday evening and any weekend `now` both give Monday 08:00; a weekday afternoon gives
  tomorrow 08:00; all in `ZoneInfo("Australia/Melbourne")`.
- The Sprint 5 dashboard must label the transit figures as an 8am weekday service. Unlabelled,
  the number reads as a promise about the user's own trip.
- The TTL is one day, settled 29/08/26. Two misses on the same day request an identical journey,
  so anything shorter buys only repeated paid calls returning the same figures; the answer can
  first change when the date rolls over. `TRANSIT_CACHE_TTL` in `core/constants.py` and both
  `CLAUDE.md` mentions now agree on it.
- The honest upgrade, deferred to Sprint 5: add a departure-hour bucket to the cache key and fetch
  the ride's actual departure time. That needs a migration to the `campus_routes` unique
  constraint, which is why it is not in this sprint.

### 3. Ride creation and search

**Write first**, in `tests/unit/test_ride_service.py` (fake repository) and
`tests/integration/test_rides_endpoint.py` (real `TestClient`):
- `POST /rides` creates a ride tied to a vehicle the *current authenticated user* owns — attempting
  to create a ride against someone else's vehicle should fail (`PermissionDeniedError` → 403).
- `GET /rides/search` filters by origin, destination, date, and only returns rides where
  `available_seats > 0`.
- **REQ-002's storage criterion**: `tests/integration/test_ride_bulk.py` inserts at least 100 ride
  offers and confirms all are retrievable via search without database errors. This is a real
  acceptance-criterion test, not a nice-to-have — it's the literal wording of REQ-002 in the RTM.

**Then implement:**
- `app/schemas/ride.py`, `app/repositories/ride_repository.py`, `app/services/ride_service.py`.
- `app/api/routes/rides.py` — `POST /rides`, `GET /rides/search`, `GET /rides/{ride_id}`, registered
  in `app/api/router.py`. (The directory is `api/routes/`, not `api/v1/`; the `/api/v1` prefix is
  set on the router.)

Two rules the original draft left unstated:

- **`rides.distance_km` comes from the cached drive route, never from the request body.** It is
  `NOT NULL`, and every emissions and cost figure downstream is `distance_km × something`, so a
  driver who can set their own distance can set their own green points.
- **`GET /rides/search` builds its date window in Melbourne time.** `departure_at` is
  `TIMESTAMPTZ` and the `date` query parameter is a local calendar date; construct the window with
  `ZoneInfo("Australia/Melbourne")` and convert, or a 9am ride falls under the previous day for
  half the year.

`test_ride_bulk.py` needs a real database — 100 rows in an in-memory dict proves nothing about
Postgres. Mark it and exclude it from the default run, or CI needs Supabase credentials. Decide
which before writing it.

### 4. Route display (REQ-007, backend half)

REQ-007 is mostly a frontend concern (rendering the route on screen), but the backend must expose
what the frontend needs to draw it.

**Write first**, in `tests/integration/test_rides_endpoint.py` (extend the existing suite):
- `GET /rides/{ride_id}` response includes `route_summary` and, for transit rides, `legs`, sourced
  from the cached `campus_routes` row for that origin/destination/mode.

**Then implement:** wire `ride_service`/`ride_repository` to join in the relevant `campus_routes`
row when building the ride detail response.

## Definition of done

- [ ] `test_route_transform.py` passes against the recorded fixture
- [ ] `test_route_service.py` proves the cache contract: a hit makes no API call, an expired transit
      row triggers a refetch and a write-back, a drive row never expires, and a failed fetch serves
      a stale row rather than raising
- [ ] A route absent from `campus_routes` is fetched, cached and returned on first query, and the
      second query for the same route makes no API call
- [ ] `test_ride_service.py`, `test_rides_endpoint.py`, and the 100-ride bulk test all pass
- [ ] `GET /ride/{id}` exposes route summary/legs for the frontend to render
- [ ] REQ-002 acceptance criteria fully met
- [ ] REQ-007's backend-facing acceptance criteria met (planned-route data available; no GPS)

## A note carried over from `build_plan.md`

**Re-check the pet stage thresholds once real distances are seeded.** They were calibrated on an
assumed 18 km typical trip, but Clayton–Caulfield is actually 10.4 km by road. Once this sprint's
seeding script runs against the live API, re-run Sprint 2's points tests with the *real* campus
distances and confirm the 3/9/28/111-ride progression from `changes.md` §2 still holds. If it
doesn't, that's a Sprint 2 constants change, not a Sprint 3 one — flag it, don't quietly patch it
here.

## Explicitly not in this sprint

- No booking — a ride can be created and searched, but nobody can claim a seat yet. That's Sprint 4.
- No comparison dashboard — Sprint 5.
