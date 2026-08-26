# Sprint 2 — User sync, vehicles, and the emissions engine

**Dates:** 28/08/26 – 11/09/26 (planned)
**Build order reference:** `build_plan.md` Steps 2, 3 and 4, combined into one sprint
**Builds toward:** REQ-001 (completed this sprint), REQ-005 (completed this sprint), and the vehicle
data every later feature reads
**Depends on:** Sprint 1's `CurrentUser`, `SupabaseDep`, and exception-handling layer, all complete

This is the heaviest sprint in the plan — three build-plan steps in one iteration. If the team is
behind schedule anywhere, split this: vehicles and the algorithms engine have no dependency on each
other and can run in parallel across two people, both depending only on Sprint 1.

## Goal

Three independent pieces land this sprint: a real user exists in the database once someone signs
in, a driver can register a car with a trustworthy fuel-consumption figure, and the pure functions
that turn a distance and a vehicle into CO2, cost and points exist and are proven correct against
hand-verified numbers. Nothing here talks to the ride/booking flow yet — that's Sprint 3 onward.

## Test-driven build order

### 1. Emissions, cost and points engine (`core/`) — start here, it has zero dependencies

These are pure functions: no database, no Pydantic, no I/O. That is what makes them testable in
milliseconds and crucial to get right before three other features start depending on the numbers.

**Write first**, in `tests/unit/test_emissions.py`, `test_costs.py`, `test_points.py`. Use the
hand-verified table from `docs/changes.md` section 1.5 directly as test fixtures — these numbers
were already checked by hand against `vehicle_reference.csv`, don't re-derive them, assert against
them:

```
18 km trip, 2 passengers, comparing old vs new formula:
  Tesla Model 3 RWD 2024   — 15.8 kWh/100km  → 0.00 kg solo → 923 points
  Toyota Camry Hybrid 2024 — 4.9 L/100km     → 2.04 kg solo → 787 points
  Toyota Corolla 2020      — 7.1 L/100km     → 2.95 kg solo → 726 points
  VW Golf 2015             — 8.05 L/100km    → 3.35 kg solo → 699 points
  Jeep Grand Cherokee 2020 — 11.3 L/100km    → 4.70 kg solo → 609 points
  Ford F-150 4X4 2020      — 10.8 L/100km    → 5.29 kg solo → 570 points
```

Also required:
- `co2_avoided` with zero passengers evaluates to exactly 0 (this is what makes an unbooked ride
  worth nothing — a property test, not just an example).
- `co2_avoided` is monotonically increasing in passenger count (Corolla, 18 km: 0 / 314 / 726 /
  1,163 / 1,610 points for 0–4 passengers, per `changes.md` §1.5 point 4).
- The `max(0, ...)` guard: construct a vehicle above 20 L/100km and confirm the result clamps to 0
  rather than going negative.
- `co2_solo` (dashboard version) vs `co2_avoided` (rewards version) must be two distinct functions
  — write a test that fails if someone collapses them back into one, since that's exactly the bug
  `changes.md` §1 exists to prevent.
- Cost: `cost_solo`, `cost_rideshare` for petrol/diesel/hybrid using `fuel_price`; electric vehicles
  branch to `ELECTRICITY_PRICE = $0.2820/kWh`, not the fuel price — write a test that would fail
  (by roughly 10x, per `changes.md` §4) if the branch is missing.
- `points_earned = floor(co2_avoided_kg * 100)`.
- Pet stage thresholds: 15 / 60 / 200 / 800 kg cumulative → hatched / juvenile / adult / legendary
  (`CLAUDE.md`, Pet Stage Thresholds table — these supersede the original proposal figures).

**Then implement**, only after the above fail for the right reason:
- `core/constants.py` — every factor, fare and threshold, each with its citation as an inline
  comment (petrol 2.31, diesel 2.72, hybrid 2.31, electric 0 kg CO2-e; train 0.038, bus 0.077, tram
  0 per passenger-km; `FLEET_AVG_RATE = 0.2564`; `ELECTRICITY_PRICE = 0.2820`; myki full $5.70 /
  concession $2.85). Constants appear exactly once — never inline a factor in a service.
- `core/emissions.py` — `co2_solo`, `co2_rideshare`, `co2_transit`, `co2_avoided` (the last per the
  formula in `changes.md` §1.2, *not* the older §1.1 formula — occupants = passengers + 1, driver
  excluded from credit).
- `core/costs.py` — solo/rideshare/transit, branching on `fuel_type`.
- `core/points.py` — `floor(co2_avoided * 100)`, and a pet-stage-from-cumulative-total function.

### 2. User sync

**Write first**, in `tests/unit/test_user_service.py`, against a fake/in-memory repository (not the
real Supabase client — this is a service-layer test):
- Syncing a brand-new `clerk_id` creates exactly one `users` row and one `rewards` row.
- Syncing the same `clerk_id` a second time changes nothing (idempotency is the whole point — the
  frontend calls this on every page load, per `build_plan.md` Step 2's rationale).
- `is_concession` is seeded `true` when the email domain is `@student.monash.edu`, `false`
  otherwise.

**Write second**, in `tests/integration/test_users_endpoint.py`, using `TestClient` with
`app.dependency_overrides[CurrentUser]` set to a fixed test identity:
- `POST /users/sync` called ten times against a test database (or a mocked repository at the route
  level) leaves exactly one user and one rewards row.

**Then implement:**
- `app/schemas/user.py` — `UserCreate`, `UserResponse`, `User`.
- `app/repositories/user_repository.py` — upsert on `clerk_id`, never a blind insert.
- `app/services/user_service.py` — sync logic, no HTTP knowledge, no `HTTPException`.
- `app/api/v1/users.py` — `POST /users/sync`, registered in `app/api/v1/router.py`.

### 3. Vehicles

**Write first**, in `tests/unit/test_vehicle_service.py`:
- Manual `fuel_consumption` is bounded: `0 < L/100km ≤ 30` and `0 < kWh/100km ≤ 45` — the same
  plausibility limits the NRCan import pipeline applies (`vehicle-reference-dataset.md` §6.1). This
  is a service-layer check; the database `CHECK` only enforces positivity, so a nonsense-but-positive
  figure that reaches the service without this check would otherwise be accepted. Test both the
  rejection and the boundary values.
- Where a `vehicle_reference` row exists for the submitted make/model/year/fuel type, the service
  prefers the reference figure over the client-submitted one.
- Where no reference row exists (test with a make known to be absent — MG, GWM, BYD, LDV, Chery or
  Haval, per `vehicle-reference-dataset.md`), registration still succeeds using the manually entered
  figure. This is not an edge case to skip — roughly 12% of the 2025 Australian market is these
  brands.

**Then implement:**
- `app/schemas/vehicle.py`, `app/repositories/vehicle_repository.py`, `app/services/vehicle_service.py`.
- `app/api/v1/vehicles.py` — `POST /vehicles`, `GET /vehicles/me`, `GET /vehicles/reference`.
- Copy the chosen consumption value onto the `vehicles` row at write time; never join to
  `vehicle_reference` at read time, or a future reseed would retroactively change emissions already
  reported for past rides.

## Definition of done

- [ ] `test_emissions.py`, `test_costs.py`, `test_points.py` all pass, including the hand-verified
      table above
- [ ] `test_user_service.py` and `test_users_endpoint.py` pass — idempotency proven at both layers
- [ ] `test_vehicle_service.py` passes, including a vehicle absent from `vehicle_reference`
- [ ] Every formula in `core/` has a test asserting a documented number, and `core/` imports nothing
      from `services/`, `repositories/`, or `api/`
- [ ] REQ-001 acceptance criteria fully met (register, non-Monash domain rejected, logout ends
      session — the last two were proven in Sprint 1/rely on Clerk's own session handling)
- [ ] REQ-005 acceptance criteria fully met (documented formulas implemented for private car,
      carpooling and public transport)

## Explicitly not in this sprint

- No ride creation, no booking, no comparison dashboard wiring — `core/` functions exist and are
  tested in isolation, but nothing calls them from a live endpoint yet. That starts in Sprint 3
  (rides) and completes in Sprint 5 (comparison dashboard).
