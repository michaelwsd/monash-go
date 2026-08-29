# Backend Build Plan

Organised by sprint, each sprint depending only on what an earlier sprint already built. Each
section states **what capability exists when the sprint is finished**, **why it sits at that point
in the order**, and links to a detailed, test-driven task breakdown in `docs/sprints/`. A sprint is
not done until its tests pass and CI is green — ticking a box here without a passing test behind it
is not progress.

**Progress:** Sprint 0 complete. Sprint 1 active (03/08/26 – 17/08/26).

This file is the roadmap: what gets built, in what order, and why. `docs/sprints/sprint-N.md` is
the detail: which tests to write first, in what order, against which fixtures. Read this file to
understand the shape of the project; read the sprint file for the sprint you're actually working on
before writing any code.

Departures from the original proposal are recorded in [changes.md](changes.md).

---

## Sprint 0 — Tooling and schema ✅ complete

**Goal.** A repository where correctness is enforced automatically rather than remembered, and
where the database can be recreated from files in git.

**Why first.** Every rule set here is one never re-litigated later. Adding a formatter to 4 files
is trivial; adding it to 40 produces a reformat commit that buries real changes. The schema gates
every later sprint: no tables, nothing to build on.

- [x] `ruff` + `mypy` + `pytest` configured in `pyproject.toml`
- [x] `src/app` layout with hatchling build config, so imports work the same in tests and production
- [x] `core/config.py` — `Settings` + cached `get_settings()`
- [x] `main.py` — CORS from settings, `/health`, `/api/v1` router mounted
- [x] `.github/workflows/ci.yml` — ruff, format, mypy, pytest on every PR
- [x] `.github/workflows/supabase-keepalive.yml` — 4-daily ping; free tier pauses at 7 days idle
- [x] `supabase/migrations/0001_init.sql` — 8 enums, 10 tables, 7 indexes, RLS on all tables
- [x] Migration applied to Supabase
- [x] `scripts/prepare_vehicle_reference.py` — NRCan open data → cleaned CSV
- [x] `scripts/seed_vehicle_reference.py` — CSV → `vehicle_reference` (17,344 rows)
- [x] `tests/unit/test_config.py`, `tests/integration/test_health.py`

**Done when.** A broken PR is red before anyone reads it, and `0001_init.sql` alone recreates the
whole schema.

*(Corrected from an earlier draft of this document, which stated 6 indexes — the migration actually
defines 7: `idx_vehicles_owner`, `idx_rides_search`, `idx_rides_driver`, `idx_bookings_passenger`,
`idx_pet_accessories_user`, `idx_vehicle_reference_lookup`, `idx_fuel_prices_latest`.)*

---

## Sprint 1 — Database client and Clerk auth 🔨 active

**Dates:** 03/08/26 – 17/08/26
**Detail:** [docs/sprints/sprint-1.md](sprints/sprint-1.md)

**Goal.** Two things every later endpoint needs: a way to reach Supabase, and a way to know *who is
calling*. By the end, a route can declare `user: CurrentUser` and be certain an authenticated
Monash user is behind the request, with no auth code of its own.

**Why now.** All 16 endpoints are `Auth: Yes`. Build this once, correctly, or write the same
token-parsing block sixteen times and get it subtly wrong in one of them. It is also the riskiest
work in the project, so it deserves attention while the team is fresh rather than in week 11.

**Notes.**
- Services must never raise `HTTPException`. They raise domain errors; handlers translate.
- Tests generate an RSA keypair in a fixture and sign their own tokens. No network, no real Clerk.
- Clerk session tokens carry no `aud` claim by default, so audience is not verified.
- One client per process via `@lru_cache`; a client per request exhausts connections.

---

## Sprint 2 — User sync, vehicles, and the emissions engine

**Dates:** 28/08/26 – 11/09/26
**Detail:** [docs/sprints/sprint-2.md](sprints/sprint-2.md)

**Goal.** Three independent pieces: a verified token becomes a real user record, a driver can
register a car with a trustworthy fuel-consumption figure, and the pure functions that turn a
distance and a vehicle into CO2, cost and points exist and are proven against hand-verified numbers.

**Why these three together.** User sync is the smallest possible feature that passes through all
four layers, so it proves the architecture works end to end before anything complicated depends on
it. The algorithms are pulled forward from their position in the original proposal (which put them
much later) because they depend on nothing, they're what the project is graded hardest on, and
"do them last" is exactly how core correctness work gets cut when a deadline arrives. Vehicles sits
alongside both because rides — and therefore everything from Sprint 3 onward — cannot exist without
a vehicle to attach them to.

**This is the heaviest sprint in the plan.** Three build-plan-sized pieces of work in one iteration.
Vehicles and the algorithms engine don't depend on each other and can run in parallel across two
people if the team is behind. Flag early if this sprint is slipping — better to know in the first
week than the last.

**Notes.**
- Upsert users on `clerk_id`, never insert blindly. Create the `rewards` row on first sign-in only.
- ~~Seed `is_concession` from the email domain: `@student.monash.edu` → true.~~ **Superseded:**
  `is_concession` defaults to false and is set from the profile form. Student status is not
  concession eligibility — a concession myki needs a separately approved card.
- Bound manual vehicle entry: 0 < L/100km ≤ 30, 0 < kWh/100km ≤ 45. Points depend on this value, so
  an unbounded figure is a gaming vector.
- Two distinct CO2 calculations. The dashboard uses the driver's actual car; rewards use the
  fleet-average counterfactual. Do not let one leak into the other — see `changes.md` §1.
- Constants appear exactly once, in `core/constants.py`, with their citation inline.
- Do a throwaway Render deploy after this sprint. Cold starts and missing environment variables are
  far cheaper to debug with two endpoints than with sixteen.

---

## Sprint 3 — Route cache and rides

**Dates:** 11/09/26 – 25/09/26
**Detail:** [docs/sprints/sprint-3.md](sprints/sprint-3.md)

**Goal.** The core marketplace: drivers post trips, passengers find them. Also where real distances
enter the system, since every emissions number downstream is `distance × something`.

**Why the cache comes first.** Ride creation needs `distance_km`, and calling Google Maps on every
request would be slow, costly, and pointless for 20 fixed campus pairs. The cache is read-through
(`proposal.md` §4.4): a route is fetched on first query and written to `campus_routes`, and every
read after that is a local lookup. Drive rows never expire — a road distance does not change —
while transit rows carry a TTL so timetable changes are eventually picked up.

**Why routes are directional.** Clayton→City and City→Clayton have different transit timetables,
interchanges, and drive durations. 20 ordered pairs × 2 modes = 40 rows, not 20.

**Notes.**
- 40 rows, not 20: enumerate with `itertools.permutations`, not `combinations`.
- The paid call belongs in `app/clients/maps.py`, not in a service — services do not speak HTTP.
- A failed fetch with a stale row cached serves the stale row; only a failure with nothing cached
  is an error.
- Transit rows must populate `legs`; transit emissions are uncomputable without it.
- Search filters route + date + `available_seats > 0`.
- **Re-check the pet thresholds once real distances are cached.** They were calibrated on an
  assumed 18 km typical trip, but Clayton to Caulfield is actually 10.4 km by road. If the real
  distances change the ride-count progression meaningfully, that's a Sprint 2 constants fix, raised
  and agreed by the team — not a silent patch mid-sprint.

---

## Sprint 4 — Bookings

**Dates:** 25/09/26 – 09/10/26
**Detail:** [docs/sprints/sprint-4.md](sprints/sprint-4.md)

**Goal.** Passengers claim seats. The only place in the product where two users can genuinely
collide, so the only place that needs real concurrency control, not just careful Python.

**Why it is the hardest correctness problem.** Read-check-write in application code has a window
between the read and the write. Two requests for the last seat can both see `available_seats = 1`
and both decrement, producing 0 with two bookings, or -1. The fix is row-level locking in the
database, not more careful application logic.

**Why the phone rule lands here.** A driver's number becomes visible only once a booking is
confirmed. Enforced by the response schema, which is why every route declares one.

---

## Sprint 5 — Comparison dashboard

**Dates:** 09/10/26 – 23/10/26
**Detail:** [docs/sprints/sprint-5.md](sprints/sprint-5.md)

**Goal.** REQ-004, the flagship feature: carpool vs public transport vs private vehicle, side by
side, with time, cost, and emissions. Where every earlier piece finally combines into something a
user sees.

**Why it is last among the "core" features.** It is pure composition — route data from Sprint 3,
algorithms from Sprint 2, vehicle data from Sprint 2. Almost no new logic, which is exactly why it
should come after all three exist rather than being stubbed.

**Why fuel prices are cached daily.** Servo Saver is rate-limited, and a price that changes
mid-session would make two identical comparisons disagree.

**Notes.**
- Reads the `fuel_prices` cache. Never call the API from a request path.
- Electric vehicles use the electricity price ($0.2820/kWh), not the fuel price.
- Transit emissions are summed per leg, not approximated from total distance.

---

## Sprint 6 — Rewards, pet accessories, and deploy

**Dates:** 23/10/26 – 06/11/26
**Detail:** [docs/sprints/sprint-6.md](sprints/sprint-6.md)

**Goal.** Close the behavioural loop the whole product rests on (completing a shared ride converts
avoided emissions into points and pet progression), give those points somewhere to go, and get the
product onto the internet in a state that survives a demo.

**Why these three together.** Rewards is a thin wrapper over `co2_avoided` and `points` — nearly
all its difficulty is in *when* it runs, not what it computes. Pet accessories depends on points
existing and is the most self-contained, safest-to-cut feature in the project if time runs short.
Deploy is infrastructure work that can run in parallel with both rather than blocking on either.

**Why "exactly once" is the whole problem for rewards.** Points are currency. Award them twice and
balances are wrong permanently, with no audit trail to unwind. `rides.co2_saved` being non-null is
the marker that payment already happened.

**Notes.**
- Thresholds are 15 / 60 / 200 / 800 kg, superseding the proposal — see `changes.md` §2.
- Accessory prices must be set against 500–2,500 points per ride, not the ~200 the proposal's
  original formula implied.
- Do the deploy checklist early in the sprint, not the last two days.

---

## Out of scope

Decided deliberately, not by omission:

- REQ-009 — cost owed to driver (should-have, no endpoint specified)
- REQ-012 — in-ride messaging (should-have)
- REQ-012 — trip history beyond `GET /bookings/me` (could-have)
- REQ-008, REQ-010 — GPS tracking and payments (won't-have, per the proposal)

---

## Standing rules

1. Routes parse and shape. Services decide. Repositories talk to Supabase. `core/` computes.
2. A layer may import from layers below it, never above.
3. Services never raise `HTTPException`.
4. Constants live once, in `core/constants.py`, with a citation.
5. Adding a `Settings` field means editing five files together: `config.py`, `.env`,
   `.env.sample`, `tests/conftest.py`, and `tests/unit/test_config.py`.
6. Every route declares its response schema. That is what stops a phone number leaking.
7. `uv run ruff format .` before pushing, or CI rejects the PR on whitespace.
8. Every feature is built test-first: the failing test exists before the implementation that makes
   it pass. See `docs/sprints/sprint-N.md` for what "first" means for each specific component.
