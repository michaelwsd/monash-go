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
  calls the Servo Saver API directly — same pattern as Sprint 3's route cache test, assert the API
  client mock is never invoked from the read path.
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
- `app/api/v1/compare.py` — `GET /compare/{ride_id}`.

## Definition of done

- [ ] `test_fuel_service.py` passes; compare path never calls the live Servo Saver API
- [ ] `test_compare_service.py` passes, including the multi-leg transit summation case
- [ ] `test_compare_endpoint.py` passes
- [ ] REQ-004 acceptance criteria fully met: after viewing a carpool option, the dashboard shows
      comparable carpool/transit/private-vehicle options, each with time, cost and emissions

## Explicitly not in this sprint

- No rewards, no pet accessories — the dashboard shows what a trip *would* cost/emit in each mode;
  it doesn't award anything for taking it. That's Sprint 6.
