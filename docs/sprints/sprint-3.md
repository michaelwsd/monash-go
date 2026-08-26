# Sprint 3 — Route cache and rides

**Dates:** 11/09/26 – 25/09/26 (planned)
**Build order reference:** `build_plan.md` Step 5
**Builds toward:** REQ-002 (driver posts a ride), REQ-007 (campus route display, backend half)
**Depends on:** Sprint 2's vehicles (a ride needs a registered vehicle)

## Goal

The core marketplace: drivers post ride offers, passengers can search them. This is also where
real distances enter the system for the first time — every emissions and cost figure downstream is
`distance_km × something`, and that distance comes from here.

## Test-driven build order

### 1. Route transform logic — test this before writing the seeding script

The seeding script itself calls a real, paid, external API, so it cannot be the thing your tests
exercise. Isolate the part that's actually risky to get wrong: turning a Google Maps Routes API
response into the `campus_routes` row shape.

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
- The transform function (e.g. `scripts/_route_transform.py`, imported by both the script and its
  test — don't duplicate this logic between test fixtures and the real script).
- `scripts/seed_campus_routes.py` — calls the Routes API for all 20 ordered campus pairs × 2 travel
  modes (**40 rows**, not 20 — see `changes.md` §5; seed with `itertools.permutations`, not
  `combinations`, since Clayton→City and City→Clayton are different rows).

### 2. Route service — proves the cache is actually being used

**Write first**, in `tests/unit/test_route_service.py`, with a fake repository:
- `route_service` reads `campus_routes` and never calls the Google Maps client — assert the mock
  Maps client's `.call()` (or equivalent) is never invoked during a normal read.

**Then implement:**
- `app/services/route_service.py` — reads the cache only, no live API calls from a request path.

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
- `app/api/v1/rides.py` — `POST /rides`, `GET /rides/search`, `GET /rides/{ride_id}`.

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
- [ ] `scripts/seed_campus_routes.py` run once against the real API produces 40 `campus_routes` rows
- [ ] `test_route_service.py` proves no live API call happens from a request path
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
