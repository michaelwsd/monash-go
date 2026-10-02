# Sprint 6 — Rewards, pet accessories, and deploy

**Dates:** 23/10/26 – 06/11/26 (planned); built 02/10/26
**Build order reference:** `build_plan.md` Steps 8, 9 and 10, combined into one sprint
**Builds toward:** REQ-006 and REQ-013, and getting the product live for a demo
**Depends on:** Sprint 2's points/pet-stage functions, Sprint 4's bookings (rewards fire on a
booking's ride reaching `completed`)

This sprint bundles three build-plan steps because pet accessories is explicitly the most
self-contained, safest-to-cut feature in the whole product (per `build_plan.md`'s own reasoning),
and deploy is infrastructure work that can genuinely run in parallel with the other two rather than
blocking on them. If the semester is behind schedule, pet accessories is what gets dropped here —
not rewards, and not deploy.

## Test-driven build order

### 1. Rewards — "exactly once" is the entire difficulty

Points are currency. Award them twice and a user's balance is wrong permanently, with no audit
trail to unwind afterwards.

**Write first**, in `tests/unit/test_rewards_service.py` (fake repository) and
`tests/integration/test_rewards_endpoint.py`:
- Marking the same ride `completed` twice awards points exactly once. Use `rides.co2_saved` being
  non-null as the marker that payment already happened (per `CLAUDE.md`) — write a test that calls
  the completion logic twice and asserts the second call is a no-op, not just that it doesn't error.
- The awarded amount matches `core/points.py`'s `floor(co2_avoided * 100)` from Sprint 2 — reuse
  those fixtures rather than inventing new numbers.
- Pet stage transitions fire at the correct cumulative totals: a user's `total_co2_saved` crossing
  15 / 60 / 200 / 800 kg moves `pet_stage` to hatched / juvenile / adult / legendary respectively —
  test the boundary exactly at each threshold, not just comfortably above it.
- `passengers` for the `co2_avoided` calculation counts only bookings with status `confirmed` or
  `completed`, excluding the driver and excluding cancelled bookings — write a test with a mix of
  confirmed, cancelled and completed bookings on one ride to prove the count is right.

**Then implement:**
- `app/repositories/rewards_repository.py`.
- `app/services/rewards_service.py` — award once on the `completed` transition.
- `app/api/routes/rewards.py` — `GET /rewards/me`.

### 2. Pet accessories

**Write first**, in `tests/unit/test_pet_service.py`:
- Buying an accessory the user can't afford raises `InsufficientPointsError`, and the user's
  balance is unchanged after the failed attempt (write this as an explicit before/after balance
  check, not just "the call raised").
- Buying an accessory above the user's current unlocked `pet_stage` raises `StageLockedError`.
- A successful purchase deducts points and the item appears in the user's owned accessories.
- Equipping toggles `equipped` on `pet_accessories` without affecting ownership or balance.

**Then implement:**
- `supabase/migrations/0006_seed_accessories.sql` — catalogue, priced against the *new* scale of
  roughly 500–2,500 points per ride (per `changes.md` §2.3), not the ~200 the original proposal
  formula implied. Pricing the catalogue against stale numbers here would make the whole shop
  either trivially affordable or permanently out of reach — sanity-check a few prices against
  Sprint 2's Tesla/Corolla/F-150 point values before committing the migration.
- `app/repositories/pet_repository.py`.
- `app/services/pet_service.py` — raises `InsufficientPointsError`, `StageLockedError`.
- `app/api/routes/pet.py` — shop listing, buy, equip, `GET /pet/me`.

### 3. Deploy — the one non-TDD part of this sprint

Deployment problems are environmental, not logical (missing env vars, cold starts, CORS), so there
is no meaningful failing test to write first here. Treat this as a checklist instead, run against
the live deployed service, not local `pytest`:

- [ ] Render service created, environment variables set from `.env.sample`
- [ ] Health check pointed at `/health`
- [ ] Uptime cron ping configured (Render's free tier sleeps after 15 minutes of inactivity)
- [ ] CORS origins updated to include the deployed frontend's real URL
- [ ] `docs_url` confirmed disabled in production (`app/main.py` already gates this on
      `settings.environment == "production"` — just confirm the env var is actually set correctly
      on Render, don't assume the code path is enough)
- [ ] A cold request to the deployed URL responds within the time a live demo can tolerate

If this sprint is genuinely deadline-constrained, do the deploy checklist early in the sprint (as
`build_plan.md` originally argued for doing a throwaway deploy back in Step 2) rather than leaving
it to the last two days — deployment surprises are cheap to fix with two working endpoints and
expensive to fix the night before a demo.

## Definition of done

- [x] `test_rewards_service.py` (19 cases) and `test_rewards_endpoint.py` (10) pass —
      double-completion is provably a no-op, asserted as an unchanged balance rather than an
      absent exception, and the stage boundaries are tested at 14.99/15.0, 59.99/60.0,
      199.99/200.0 and 799.99/800.0
- [x] `test_pet_service.py` (11 cases) passes — no overdraw, no buying above current stage, and a
      refused purchase leaves the balance byte-identical
- [x] REQ-006 acceptance criteria fully met: points awarded on completion, balance updates in the
      database and in the UI, points spendable on pet items
- [x] REQ-013 met: `GET /rewards/me` summarises completed trips, and `/rewards` plus the dashboard
      render it, zero-state included
- [ ] Deploy checklist fully ticked against the live Render URL — **still open**, see below

## What this sprint decided

**The driver taps "Mark complete". Nothing sweeps.** There is no background job marking departed
rides complete, and `rides.status` never moves on its own. A trip that was posted and never taken
should not pay anyone, and only the driver knows which is which. Wireframe 1j already had the
button on a past-driver row; it now does something.

**Everyone on the ride is credited the full figure.** A 7.26 kg ride gives the driver 7.26 kg and
each confirmed passenger 7.26 kg — 726 points each, not 726 split three ways. Summed across
accounts that is more CO2 than the trip actually avoided, and that is the deliberate choice: the
pet thresholds in `core/constants.py` were calibrated against one person banking the whole figure
per ride (3 rides to hatched, 9 to juvenile, 28 to adult, 111 to legendary). It is gamification,
not carbon accounting. `rides.co2_saved` holds the real, unmultiplied number, so the honest figure
survives in the one place a future report would read. `CLAUDE.md` now says this beside the
formulas, because it is not derivable from them.

**REQ-009 stays out, and the earlier audit of it was wrong.** A requirements check during Sprint 5
listed REQ-009 (cost owed per passenger) as "not built — Sprint 6". It is not pending:
`build_plan.md:210` lists it under *"Out of scope — decided deliberately, not by omission"*. The
comparison dashboard already shows what a seat costs, and money moving between students needs a
settlement story this project does not have. Nothing was dropped; the audit mislabelled a decision
as an omission.

**Three races, one pattern.** Completion and purchase join booking in being PL/pgSQL functions
under `SELECT … FOR UPDATE`, returning a result word that the repository maps to a domain error.
Each is a read-decide-write on money or seats, and `threading.Lock` would protect only one uvicorn
worker.

- `complete_ride()` locks the ride row. A non-null `co2_saved` is the marker that it has been
  paid, so two taps arriving together produce one payout and two 200s.
- `buy_accessory()` locks the caller's own user row. Two taps on *Buy* would otherwise both read
  the same balance and both pass the check.

**The figures are computed in Python, written in SQL.** `co2_avoided` and `points_earned` are
Sprint 2's tested pure functions and stay that way; the SQL function takes the numbers as
arguments and does the atomic write. Pet stage is recomputed in the service from the new
`total_co2_saved`, so the thresholds live in `core/constants.py` and are not duplicated in a
migration — and `GET /rewards/me` derives the stage on every read rather than trusting the stored
column, so changing a threshold needs no backfill.

**Null means "not finished", never zero.** `RideResponse` deliberately dropped `co2_saved` and
`points_earned` back in Sprint 3; a completed ride needs them, so they are back. They stay
nullable because a solo ride legitimately avoids exactly 0.00 kg — the `max(0, …)` formula was
chosen for that property — and the screen has to tell "not completed" from "completed, earned
nothing".

**The pet is a creature, not a plant, and accessories are fitted rather than pasted.**
The stage names are hatching language, and five of the twelve shop items are a scarf, a vest,
glasses, an umbrella and a coffee cup - none of which a plant can wear. `components/pet.tsx` draws
five bodies that visibly grow, and each stage publishes anchor points (`headTop`, `eyeY`, `neckY`,
`bodyW`, `hand`) that `components/pet-accessories.tsx` draws against. That is why the art is inline
SVG and not twelve PNGs: a hat has to sit lower on a hatchling than on an adult, and a scarf has to
be as wide as the body it is tied around rather than as wide as the face above it. Accessories are
keyed by the basename of `accessories.image_url`, so a row added in SQL with no drawing behind it
simply does not render rather than breaking the pet. Idle motion only - bob, wobble, blink, and the
legendary aura - all switched off under `prefers-reduced-motion`.

## Two bugs this sprint turned up

**`useMyTrips` filtered to `confirmed` only.** Completing a ride moves its bookings to
`completed`, so every finished trip silently vanished from `/trips` — the page where the earnings
line was being added. Now `confirmed` or `completed`; only a cancelled booking is not a trip.

**The shop rendered an empty card rather than saying it was empty.** Before `accessories` had any
rows, `/rewards` drew a card containing the word "Shop" and nothing else, with no hint that this
was a seeding problem rather than a user state. It now says so.

**A lost completion race recomputed from the wrong state.** When the SQL function answered
`already_completed`, the service was returning the figures it had just computed. But the winning
call had already moved every booking to `completed`, so the recount saw zero confirmed passengers
and reported a 0 kg ride. It now re-reads what was actually stored. Caught by
`test_completing_twice_awards_once`, which compared the two calls' figures rather than only
checking that neither raised.

## Carried forward

- **Deploy is still unverified.** `monashgo.vercel.app` answers 404 from Vercel and no Render
  hostname has been confirmed. `CORS_ORIGINS` in `backend/.env` and in
  `.github/workflows/fuel-prices.yml` both still name `monashgo.vercel.app`, so if the real URL
  differs, both need changing or the frontend's requests will be blocked by CORS.
- **The pet thresholds have still never been checked against real seeded distances.** Open since
  Sprint 2. 15/60/200/800 kg assumes a typical 18 km trip with 2 passengers; the actual
  campus_routes distances range wider than that.
- **Still open from earlier sprints**: `ride_repository.get_ride` should be `get_by_id`,
  `DELETE /vehicles/{id}`, and the duplicated `pandas` in `pyproject.toml`.
- **REQ-003 has no time-of-day filter and REQ-011 no suitability ranking.** Search is by campus
  pair and date only. Neither was scheduled; both are small and would read as polish.

## Explicitly not in this sprint

- Anything from the "Out of scope" list in `build_plan.md` (REQ-008 GPS, REQ-009 cost-owed record,
  REQ-010 payments, REQ-012 messaging and extended trip history) stays out for the whole project,
  not just this sprint — don't let end-of-semester pressure quietly pull one of these back in
  without the team agreeing to expand scope first.
