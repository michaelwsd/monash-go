# Sprint 6 — Rewards, pet accessories, and deploy

**Dates:** 23/10/26 – 06/11/26 (planned)
**Build order reference:** `build_plan.md` Steps 8, 9 and 10, combined into one sprint
**Builds toward:** REQ-006, and getting the product live for a demo
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
- `app/api/v1/rewards.py` — `GET /rewards/me`.

### 2. Pet accessories

**Write first**, in `tests/unit/test_pet_service.py`:
- Buying an accessory the user can't afford raises `InsufficientPointsError`, and the user's
  balance is unchanged after the failed attempt (write this as an explicit before/after balance
  check, not just "the call raised").
- Buying an accessory above the user's current unlocked `pet_stage` raises `StageLockedError`.
- A successful purchase deducts points and the item appears in the user's owned accessories.
- Equipping toggles `equipped` on `pet_accessories` without affecting ownership or balance.

**Then implement:**
- `supabase/migrations/0003_seed_accessories.sql` — catalogue, priced against the *new* scale of
  roughly 500–2,500 points per ride (per `changes.md` §2.3), not the ~200 the original proposal
  formula implied. Pricing the catalogue against stale numbers here would make the whole shop
  either trivially affordable or permanently out of reach — sanity-check a few prices against
  Sprint 2's Tesla/Corolla/F-150 point values before committing the migration.
- `app/repositories/pet_repository.py`.
- `app/services/pet_service.py` — raises `InsufficientPointsError`, `StageLockedError`.
- `app/api/v1/pet.py` — shop listing, buy, equip, `GET /pet/me`.

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

- [ ] `test_rewards_service.py` and `test_rewards_endpoint.py` pass — double-completion is
      provably a no-op, pet stage transitions fire at the correct totals
- [ ] `test_pet_service.py` passes — no overdraw, no buying above current stage
- [ ] Deploy checklist fully ticked against the live Render URL
- [ ] REQ-006 acceptance criteria fully met: points awarded on completion, balance updates in DB
      and UI, points spendable on pet items

## Explicitly not in this sprint

- Anything from the "Out of scope" list in `build_plan.md` (REQ-008 GPS, REQ-009 cost-owed record,
  REQ-010 payments, REQ-012 messaging and extended trip history) stays out for the whole project,
  not just this sprint — don't let end-of-semester pressure quietly pull one of these back in
  without the team agreeing to expand scope first.
