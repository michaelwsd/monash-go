# MonashGO — session handover

Written 25 August 2026. Everything an assistant or teammate needs to resume this
backend work without re-reading the whole conversation.

Source-of-truth documents remain `CLAUDE.md`, `docs/build_plan.md`,
`docs/sprints/sprint-N.md` and `docs/changes.md`. This file records **state and
decisions**, not specifications.

---

## 1. The project in one paragraph

MonashGO is a campus carpooling app for Monash. Drivers post trips between
campuses, passengers claim seats, and the product's real point is the
comparison: for any trip, what it costs in time, money and CO2 by carpool
versus public transport versus driving alone. Completing a shared ride converts
avoided emissions into green points, which feed a pet progression system.
Sixteen endpoints (now eighteen, see §5), six sprints, delivering early
November. Backend is FastAPI + Supabase + Clerk; frontend is Next.js 16.

---

## 2. Where we are

**Sprint 1 — database client and Clerk auth: complete and merged.**
**Sprint 2 — user sync, vehicles, emissions engine: two of three pieces done.**

| Piece | State |
|---|---|
| Domain errors + handlers | done, `89b7c19` |
| Cached Supabase client | done, `ae3c81e` |
| Clerk JWT verification | done, `7f553be` |
| `CurrentUser` dependency | done, `92aa372` |
| Claims carry email + name | done, `01a4e85` |
| `POST /users/sync` | done, `ab8216a` |
| `PATCH /users/me` | done, `cd7a8df` |
| Monash email enforcement | done, `054c8d4` |
| Vehicles (3 endpoints + suggestions) | done, `db2dd8c` |
| **Algorithms engine (`core/`)** | **in progress, see §3** |

Frontend has sign-in wired to Clerk Google OAuth, a `MonashGuard` that signs
non-Monash accounts out, `proxy.ts` route protection, and a placeholder
dashboard fed entirely by `lib/fake-dashboard.ts`. **No frontend screen calls
the API yet.**

---

## 3. Exactly where we stopped

Branch: **`engine`**. Working tree is dirty.

```
 M backend/app/core/constants.py     emission/transit/fleet/electricity/pet constants added
 M backend/app/schemas/enums.py      TransitMode and PetStage added
?? backend/app/core/emissions.py     written, uncommitted
```

**Still to write, in this order:**

1. `backend/app/core/costs.py` — `cost_solo`, `cost_rideshare`, `cost_transit`
2. `backend/app/core/points.py` — `points_earned`, `pet_stage_for`
3. `backend/tests/unit/test_emissions.py`
4. `backend/tests/unit/test_costs.py`
5. `backend/tests/unit/test_points.py`

Then `uv run ruff check --fix . && uv run ruff format . && uv run mypy . && uv run pytest`,
and commit. That closes Sprint 2.

**Correction to carry forward:** the draft `test_emissions.py` asserted the
Corolla passenger progression as `[0, 314, 726, 1163]`. The correct values are
`[0, 313, 726, 1163]` — see §6.

---

## 4. Architecture and conventions

### The four layers, one-way dependencies

```
api/routes/     parse, call a service, shape a response. No business logic.
services/       decide. No HTTP knowledge, never raises HTTPException.
repositories/   every Supabase call, one module per table. Returns models, not dicts.
core/           pure computation. Zero I/O. config, constants, security, emissions, costs, points.
```

`schemas/` holds Pydantic models (`XCreate` request, `X` internal, `XResponse`
wire). `exceptions/` holds domain errors and the single handler that maps them
to status codes.

### The recipe for every endpoint

```
contract -> schemas -> repository -> service (+ its test) -> route -> register -> verify
```

Written bottom-up; requests flow top-down. Used three times so far and it has
held each time.

### Error handling

Services raise `DomainError` subclasses. One handler registered on the base
class reads `status_code` off the instance, so a new error type is four lines in
`errors.py` and no change anywhere else.

```
DomainError             500 (base; raised directly only when nothing fits)
NotFoundError           404
PermissionDeniedError   403
InvalidCredentialsError 401
InvalidInputError       400
```

FastAPI's own 422 covers malformed request bodies and is separate.

### Sync, not async

`supabase-py` blocks. Every route, service and repository function that touches
it is a plain `def`, so FastAPI runs it in a threadpool rather than freezing the
event loop. Do not "upgrade" these to `async def`.

### Testing policy (agreed this session)

Deliberately lighter than `sprint-N.md` prescribes:

- **Service layer:** unit tests against in-memory fakes, patched in with
  `monkeypatch.setattr(service, "x_repository", FakeRepo())`.
- **`core/`:** unit tests asserting documented numbers. These earn their keep.
- **Routes:** one integration test per endpoint at most (happy path + 401).
- **Repositories:** none. Mocking Supabase to prove you called Supabase tests
  nothing.
- **Auth:** kept at four tests despite the trim, because an auth bug is silent.

### The gate

```bash
cd backend
uv run ruff check --fix . && uv run ruff format . && uv run mypy . && uv run pytest
```

CI runs the same four. Import ordering in this repo puts `from supabase import
Client` **after** the `app.` block; ruff accepts it, so leave it.

Repositories use `Model.model_validate(row)`, not `Model(**row)` — the Pydantic
v2 idiom, and it avoids mypy complaints.

---

## 5. Decisions taken this session

Each of these departs from, or fills a gap in, the written specs.

**Clerk session token carries `email` and `full_name` as custom claims.**
Configured in Clerk Dashboard → Sessions → Customize session token, using
`{{user.primary_email_address}}` and `{{user.full_name}}`. `verify_clerk_token`
returns a `ClerkClaims` model rather than a bare `str`. Reason: `POST
/users/sync` needs an email to create a row, and taking it from a signed token
means the client cannot forge it.

**`is_concession` is NOT derived from the email domain.** Student status is not
concession eligibility — a concession myki requires a separate approved card.
It defaults to `false` and the profile form sets it. This supersedes
`CLAUDE.md` line 150 and `sprint-2.md` §2, both of which still say otherwise.

**Sync is get-or-create, not upsert-everything.** Only `email` and `full_name`
are Clerk's to own and get updated. `phone`, `is_concession`, `home_campus`,
`role` and `green_points` are written on create at most and never touched
again, because the frontend calls sync on every page load.

**`PATCH /users/me` added — endpoint 17.** Not in `CLAUDE.md`'s list. Serves
wireframe artboard `1m` (concession toggle, home campus, phone). Uses
`model_dump(exclude_unset=True)` so a form submitting one field does not blank
the others.

**`GET /vehicles/reference/similar` added — endpoint 18.** Progressive
relaxation: same model any year → similar model name same fuel type → same make
and fuel type. Returns the first tier with results, each labelled with why it
matched, sorted by year proximity. Honest limitation: for MG, GWM, BYD, LDV,
Chery and Haval there are *zero* rows, so it helps with Canadian trim-name and
year mismatches, not with genuinely absent brands.

**Picking a suggestion stores the reference row's details wholesale.** The
client sends `reference_id`; make, model, year, fuel type and consumption all
come from that row, so the stored vehicle corresponds to a real dataset entry
and its figure stays traceable.

**`users.home_campus` added** (`campus` enum, nullable). `0001_init.sql` was
edited in place rather than adding `0002`, and the database was dropped and
recreated. Teammates must do the same.

**Monash domain check lives in the backend.** Clerk's allowlist is a paid
feature, so `user_service.sync` raising `PermissionDeniedError` for a non-Monash
email *is* the restriction, not a backstop. `MonashGuard` on the frontend is UX
only.

**CORS gained `PATCH`.** `main.py` previously listed only GET/POST/PUT/DELETE,
which would have blocked `PATCH /users/me` at the browser preflight.

---

## 6. Emissions maths — verified

Recomputed independently, including a full scan of all 17,344 rows of
`vehicle_reference.csv`.

**Reproduces exactly:** all six vehicles in `changes.md` §1.5, both the "ride
emits" column and the points column (923 / 787 / 726 / 699 / 609 / 570). The
§1.8 hand-check also holds.

**Three documentation errors found:**

1. **§1.5 point 4 progression.** Documented `[0, 314, 726, 1163, 1610]`; the
   formula gives `[0, 313, 726, 1163, 1609]`. Both discrepancies come from
   rounding `co2_solo` to two decimals before subtracting.
2. **`FLEET_AVG_RATE` precision is inconsistent.** §1.3 rounds it to `0.2564`,
   but §1.8's clamp scan only reproduces with the unrounded `0.25641`.
   Recommendation: define it as `(11.1 / 100) * 2.31` so the derivation is
   visible and the ambiguity disappears.
3. **§4 has the error direction backwards.** It says feeding a petrol price to
   an EV gives a figure "roughly ten times too low"; it is roughly seven times
   too **high** ($5.40 against $0.80 for an 18 km trip). The branch is still
   needed; the stated direction is inverted.

**Clamp scan gives 8, not 6.** All eight are Lamborghini Aventadors at one
passenger, 22.2–23.1 L/100 km. The two 22.2 rows sit almost exactly on zero, so
they count or not depending on which `FLEET_AVG_RATE` precision is used. Exact
thresholds: clamps above 22.20 L/100 km at 1 passenger, 33.30 at 2, 44.40 at 3.

**Two things not written down anywhere:**

- The consumption ceilings (30 L/100 km, 45 kWh/100 km) never bind on real
  data — the thirstiest dataset row is 23.1 L/100 km. They constrain manual
  entry only, which is their purpose.
- A legitimately registered thirsty vehicle earns **zero** with one passenger,
  since registration allows up to 30 L/100 km and the clamp starts at 22.2.

**Framing worth stating in `changes.md` §1.2:** the formula is an
*attributional* accounting (each occupant charged a share of the ride). A
*consequential* view — only the trips not made count — would give 9.23 kg
rather than 7.26 kg at two passengers. Neither is wrong; the attributional one
is more conservative and is consistent with `co2_rideshare = co2_solo /
occupants` on the dashboard. Mixing the two would be the actual error.

---

## 7. Open decisions

**`users.role` never changes.** Nothing sets it to `driver`. Registering a
vehicle is the natural moment, and it stops being cosmetic at Sprint 3, since
nobody can post a ride otherwise. Three lines in `vehicle_service.register`.

**`cost_rideshare` divisor.** `CLAUDE.md` says `cost_solo /
number_of_passengers`, which taken literally means the driver pays nothing.
Implemented as division by `occupants` (driver included), matching
`co2_rideshare`. Confirm the intent.

**Phone number collection.** `users.phone` is `NOT NULL` and sync writes `''`.
No wireframe screen collects it. Clerk can collect phone numbers if enabled,
which would let `user.primary_phone_number` ride in the token like the other
two.

**Waitlist.** The wireframe has a "Waitlist" button on full rides. No table, no
sprint. Either drop it from the design or add it to the out-of-scope list.

**Ride lifecycle.** Nothing moves a ride to `in_progress` or `completed`, yet
Sprint 6's rewards depend on completion. Unowned.

**Clerk configuration still incomplete.** Email and password sign-up should be
turned off so Google is the only route in. "First and last name" must stay
enabled (the token template depends on it); "Require first and last name" is
worth enabling so `full_name` is never empty.

**No real Clerk token has ever been verified end to end.** The suite uses a
generated keypair, so it proves the verifier is correct but not that `.env`
holds the right public key. Outstanding since Sprint 1's definition of done.

---

## 8. Documentation fixes owed

- `CLAUDE.md` line 114 and 150: `is_concession` is no longer seeded from the
  email domain.
- `docs/sprints/sprint-2.md` §2: same, and it is a definition-of-done item that
  will not be met as written.
- `docs/changes.md`: three numeric corrections from §6 above; plus new entries
  for `PATCH /users/me` (endpoint 17), `GET /vehicles/reference/similar`
  (endpoint 18), the `is_concession` change, and `home_campus`.
- `frontend/lib/monash.ts` line 5 points at `user_service.py`; the constant
  moved to `core/constants.py`.
- `backend/app/core/constants.py`: the consumption-ceiling comment says
  "petrol and electric" but the L/100 km limit covers petrol, diesel and
  hybrid, and it needs its `vehicle-reference-dataset.md` §6.1 citation back.

---

## 9. Working style that has been effective

- The user writes all the code. The assistant supplies complete files with
  explanatory comments and documentation links, then reviews what lands on disk.
- Documentation links per file, every time — the user asked for this explicitly.
- Options presented before any substantial piece of work, with a recommendation,
  and the user picks.
- Corrections flagged plainly, including the assistant's own mistakes. Several
  real bugs were caught this way: a wrong exception type in `security.py`, a
  missing `full_name` in an insert payload, a `datetime` typo, missing `PATCH`
  in CORS, and the arithmetic errors in §6.
- Verify before asserting. Repo state is checked with `git`/`ls` before claiming
  anything about it; numbers are recomputed rather than trusted.

---

## 10. To resume

1. `cd backend && git status` — expect the three dirty files from §3 on branch
   `engine`.
2. Write `core/costs.py`, `core/points.py`, and the three `core` test files.
3. Use `[0, 313, 726, 1163]` for the passenger progression assertion.
4. Run the gate, commit, close Sprint 2.
5. Then Sprint 3: route cache and rides. Read `docs/sprints/sprint-3.md` first
   — it needs a recorded Google Maps fixture, and the seeding script covers 40
   directional rows, not 20.
