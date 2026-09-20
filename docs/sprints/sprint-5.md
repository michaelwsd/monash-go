# Sprint 5 — Comparison dashboard

**Dates:** 09/10/26 – 23/10/26 (planned)
**Build order reference:** `build_plan.md` Step 7
**Builds toward:** REQ-004 (the flagship feature)
**Depends on:** Sprint 2's `core/` algorithms, Sprint 3's route cache, Sprint 4's bookings (a ride
needs to be bookable for a comparison to mean anything in context)

## Goal

REQ-004: carpool vs public transport vs private vehicle, side by side, with time, cost and
emissions. Almost no new logic lands this sprint — it's composition of pieces that already exist
and are already tested. That's deliberate: this is why it comes after Sprints 2–4 rather than being
stubbed out earlier and filled in later.

## Test-driven build order

### 1. Fuel price cache

**Write first**, in `tests/unit/test_fuel_service.py`:
- The compare service reads the most recent cached `fuel_prices` row per `fuel_type` and never
  calls the Servo Saver API directly — assert the API client mock is never invoked from the read
  path. Note this is **not** the same pattern as Sprint 3's route cache: fuel prices are written by
  a scheduled daily job and only ever read on a request path, whereas a route is fetched lazily on
  a cache miss. Do not copy Sprint 3's service and expect this assertion to hold.
- A price fetched today and a price fetched tomorrow don't retroactively change a comparison
  computed earlier in the same session — this matters because Servo Saver is rate-limited and a
  price that moved mid-session would make two identical comparisons disagree, which is confusing
  and untestable if it can happen.

**Then implement:**
- `app/services/fuel_service.py` — daily Servo Saver fetch → `fuel_prices` table.
- `scripts/fetch_fuel_prices.py` plus a scheduled workflow (this is the one part of this sprint
  that isn't unit-testable in the traditional sense — a scheduled job that hits a rate-limited
  external API. Test the fetch-and-write logic with the HTTP call mocked; don't test the actual
  schedule, that's a GitHub Actions cron config, not application code).

### 2. Compare service — pure composition, reuse Sprint 2's fixtures

**Write first**, in `tests/unit/test_compare_service.py`. Reuse the exact vehicles and distance from
Sprint 2's emissions test table (`changes.md` §1.5) so the expected numbers are already
hand-verified — don't invent new fixtures here, cross-check against the same source of truth:
- Given a ride (route + vehicle + passenger count) and a cached fuel price, `compare_service`
  returns all three modes (carpool, transit, private) with time, cost and emissions for each.
- Transit emissions are the **sum over legs**, not an approximation — construct a fixture route
  with a multi-leg transit journey (walk + train + tram, say) and assert the total is the sum of
  each leg's `distance_km × mode factor`, not `total_distance × one factor`. This is explicitly
  called out in `build_plan.md`'s "Done when" for this step; it's an easy shortcut to take by
  accident and it would silently produce wrong numbers for every multi-modal trip.
- Electric vehicles use `ELECTRICITY_PRICE`, not the cached fuel price — reuse Sprint 2's EV cost
  test rather than re-deriving it.

**Then implement:**
- `app/schemas/compare.py`.
- `app/services/compare_service.py` — composes `route_service` (Sprint 3), `fuel_service` (above),
  and `core/emissions.py` + `core/costs.py` (Sprint 2). This file should be short — if it's growing
  new calculation logic rather than just calling existing functions, that logic probably belongs in
  `core/` instead, where it can be unit tested in isolation.

### 3. The endpoint

**Write first**, in `tests/integration/test_compare_endpoint.py`:
- `GET /compare/{ride_id}` returns all three modes in one response.
- A request for a ride ID that doesn't exist returns a clean 404 (`NotFoundError` from Sprint 1's
  exception layer), not an unhandled error.

**Then implement:**
- `app/api/routes/compare.py` — `GET /compare/{ride_id}`.

**Sprint complete, 20/09/26.** 249 tests pass in the default run. `GET /compare/{ride_id}` is
live, the fuel job has run against the real database, and the workflow is written and waiting for
one manual run after the push.

### Decisions taken while building

**Fuel prices are the statewide median, in dollars.** The live response on 16/09/26 had 1,757
stations, one of them selling U91 at 369.9c against a median of 217.9c - a mean moves 9c on that
pump, a median does not move. A Greater Melbourne bounding box was considered and dropped: it
changed the answer by 2c and cost a magic rectangle. Cents become dollars in `fuel_transform`, once,
because `cost_solo` multiplies straight by litres.

**Petrol maps to U91, diesel to DSL, hybrid to U91.** `SERVO_FUEL_CODES` in `core/constants.py`,
cited to the Fair Fuel Open Data API PDF (`docs/servoapidocs.pdf`). Electric never touches the
table; `price_per_unit` in `core/costs.py` substitutes `ELECTRICITY_PRICE`.

**`fuel_prices` is append-only.** Every morning adds three rows and the reader takes the newest
per fuel type. Replacing was considered and rejected: the table has no unique key on `fuel_type`
by design, the history is the only external data this project generates, and a thousand rows a
year is nothing.

**The read path has no http argument at all.** `fuel_service.latest_price(db, fuel_type=...)`
cannot call Servo Saver because it is never handed a client. `test_fuel_service.py` hands the write
path an `ExplodingClient` whose every attribute access raises, and the read tests assert the
client module was never called. Servo Saver allows ten requests a minute.

**The comparison is for a prospective passenger.** `riders = confirmed bookings + 1`, unless the
caller already holds a seat, in which case they are already counted. A ride nobody has booked
compares for one rider rather than dividing by zero. This needed `booking_repository.count_confirmed`,
which uses PostgREST's `count=exact` rather than fetching rows to count them.

**Two denominators, deliberately.** Carpool cost divides among passengers (the driver was paying
anyway); carpool CO2 divides among occupants (everyone in the car). Both are the proposal's
formulas and `test_compare_service.py` pins them separately so they cannot drift together.

**Transit emissions are summed over legs.** The shortcut `build_plan.md` warns about - total
distance times one factor - is asserted against with a walk + train + tram fixture where only the
train leg emits: 9.1 x 0.038, and explicitly not 11.4 x 0.038.

**`compare_service` has no arithmetic.** Six lookups, two decisions, three calls into `core/`.
The one conversion it does is `schemas.route.TransitLeg` (Pydantic) to `core.emissions.TransitLeg`
(a NamedTuple), the boundary `route.py`'s docstring promised would land here.

**The response carries its inputs.** `riders`, `is_concession` and `fuel_price` travel with the
three rows so the dashboard can print its assumptions. Two people comparing the same ride can
legitimately get different numbers, and the screen has to be able to say why.

## Definition of done

- [x] `test_fuel_service.py` passes; compare path never calls the live Servo Saver API
- [x] `test_compare_service.py` passes, including the multi-leg transit summation case
- [x] `test_compare_endpoint.py` passes
- [x] REQ-004 acceptance criteria fully met: after viewing a carpool option, the dashboard shows
      comparable carpool/transit/private-vehicle options, each with time, cost and emissions

## Carried into Sprint 6

- **The fuel workflow needs one manual run.** `.github/workflows/fuel-prices.yml` is written and
  the seven secrets it needs already exist for CI, but it has not run on GitHub yet. Trigger it from
  the Actions tab after the push and check the log shows three `201 Created` lines.
- **No frontend yet for the comparison.** The endpoint is live; the dashboard in artboard 1g is
  the frontend's next piece.
- **Still open from earlier sprints**: the pet stage thresholds against real distances,
  `ride_repository.get_ride` should be `get_by_id`, `DELETE /vehicles/{id}`, and the duplicated
  `pandas` in `pyproject.toml`.

## Explicitly not in this sprint

- No rewards, no pet accessories — the dashboard shows what a trip *would* cost/emit in each mode;
  it doesn't award anything for taking it. That's Sprint 6.
