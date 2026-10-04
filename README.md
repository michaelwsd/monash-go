# MonashGO

A green ride-sharing platform for Monash students and staff. Passengers find carpools
between campuses, the app compares that trip against public transport and driving alone,
and the CO2 avoided turns into green points and a pet that evolves.

| | |
|---|---|
| Frontend | Next.js 16 / React 19 / TypeScript / Tailwind 4, deployed on Vercel |
| Backend | Python 3.12 / FastAPI, deployed on Render |
| Database | Supabase (PostgreSQL) |
| Auth | Clerk, Google OAuth restricted to `student.monash.edu` and `monash.edu` |
| Data | Google Maps Routes API, Servo Saver fuel prices, NRCan vehicle consumption |

## Contents

- [What it does](#what-it-does)
- [How the numbers work](#how-the-numbers-work)
- [Repository layout](#repository-layout)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Environment variables](#environment-variables)
- [Backend architecture](#backend-architecture)
- [Frontend architecture](#frontend-architecture)
- [Adding a feature](#adding-a-feature)
- [Before you push](#before-you-push)
- [The API](#the-api)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Conventions](#conventions)
- [Further reading](#further-reading)

---

## What it does

| Requirement | What a user sees | Where it lives |
|---|---|---|
| 1. Monash-only accounts | Google sign-in through Clerk. Any other domain is signed out again before it reaches the app | `frontend/components/monash-guard.tsx`, `backend/app/services/user_service.py` |
| 2/3. Find and book a ride | Search by origin campus, destination campus and day. Ride cards show the route, departure time, driver and seats left. Booking is atomic, so two people cannot take the last seat | `frontend/app/(app)/rides/`, `0003_book_seat.sql` |
| 4. Comparison dashboard | Carpool, public transport and driving alone side by side: time, cost and CO2. On a ride page it uses the driver's real car; on a search with no rides it gives a rough estimate with the fleet-average car | `frontend/components/comparison-panel.tsx`, `frontend/components/route-estimate.tsx`, `backend/app/services/compare_service.py` |
| 5. Rewards and the pet | When a driver marks a ride complete, everyone on it earns CO2 avoided and green points. The pet grows from egg to legendary, and points buy accessories in the shop | `frontend/app/(app)/rewards/`, `backend/app/services/rewards_service.py`, `pet_service.py` |

Drivers also register cars (with a consumption lookup that is a convenience, never a
requirement), post drives, see who has booked with their phone numbers, and complete
drives after departure. Phone numbers only appear once a seat is booked, in both
directions.

---

## How the numbers work

Every constant lives once, in `backend/app/core/constants.py`, with its citation inline.
`docs/proposal.md` section 4.1 is the source of truth for the factors; `docs/changes.md`
records the two places this project deliberately departs from it (the CO2 avoided formula
and the pet thresholds).

There are two separate calculations, and neither may leak into the other.

**The comparison** answers "what does this trip cost in each mode?"

```
CO2 solo      = distance_km x (fuel_consumption / 100) x emission_factor
CO2 carpool   = CO2 solo / occupants            (everyone in the car, driver included)
CO2 transit   = sum over legs of leg.distance_km x that leg's mode factor
cost solo     = distance_km x (fuel_consumption / 100) x fuel_price
cost carpool  = cost solo / passengers          (the driver was paying anyway)
cost transit  = flat myki fare: $2.85 concession, $5.70 full
```

Electric cars use kWh/100km and the electricity price ($0.2820/kWh, Victorian Default
Offer 2026-27) in place of litres and fuel, so every cost and emissions function branches
on `fuel_type`.

**Rewards** answer "what did carpooling avoid?", and are calculated once, when the driver
completes the ride:

```
occupants   = passengers + 1
CO2 avoided = max(0, passengers x distance_km x 0.2564 - (passengers / occupants) x CO2 solo)
points      = floor(CO2 avoided x 100)
```

`0.2564` kg/km is the fleet-average petrol car (11.1 L/100km, ABS 2020). It assumes every
passenger would otherwise have driven alone, which over-credits, and that assumption is
stated wherever the constant appears. The driver and each passenger are credited the full
figure, which is gamification rather than carbon accounting; `rides.co2_saved` keeps the
real, unmultiplied number.

| Pet stage | Cumulative CO2 avoided | Typical rides to reach |
|---|---|---|
| egg | 0 kg | - |
| hatched | 15 kg | 3 |
| juvenile | 60 kg | 9 |
| adult | 200 kg | 28 |
| legendary | 800 kg | 111 |

Emission factors come from the NGA Factors 2024 (petrol 2.31, diesel 2.72 kg CO2-e/L).
Train is 0.038, bus 0.077 and tram 0 kg per passenger-km. Live fuel prices come from
Servo Saver, fetched once a day.

---

## Repository layout

```
monash-go/
├── backend/            FastAPI app, migrations, scripts and tests (see Backend architecture)
├── frontend/           Next.js app (see Frontend architecture)
├── docs/               proposal, build plan, API reference, sprint notes, test plan
├── design/             the wireframes the frontend was built from
├── .github/workflows/  CI, the daily fuel price fetch, the Supabase keep-alive
├── render.yaml         the Render blueprint for the backend
├── CLAUDE.md           requirements, schema, formulas and architecture rules in one place
└── AGENTS.md           notes for coding agents (this Next.js has breaking changes)
```

---

## Prerequisites

| Tool | Why | Install |
|---|---|---|
| [uv](https://docs.astral.sh/uv/) | Python dependency and venv manager | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| Node 20+ | Frontend | `nvm install 20` |
| Python 3.12 | Pinned in `backend/.python-version` | `uv` installs it for you |

You also need credentials for Supabase, Clerk, Google Maps and the Servo Saver API. Ask a
maintainer rather than creating your own projects, otherwise you will be developing
against an empty database.

---

## Setup

Clone, then set up each side once.

### Backend

```bash
cd backend
cp .env.sample .env        # then fill in every value
uv sync                    # creates .venv and installs everything, including dev tools
uv run uvicorn app.main:app --reload
```

- API: `http://localhost:8000/api/v1`
- Interactive docs: `http://localhost:8000/docs` (disabled when `ENVIRONMENT=production`)
- Health check: `http://localhost:8000/health`

`Settings` is built at import time and forbids unknown keys, so a missing or misspelled
variable fails immediately and loudly rather than at the first request.

### Frontend

```bash
cd frontend
cp .env.sample .env.local  # then fill in your Clerk keys
npm install
npm run dev
```

Runs on `http://localhost:3000`. `NEXT_PUBLIC_API_URL` must point at the backend, and that
same origin must appear in the backend's `CORS_ORIGINS` or every request is blocked by the
browser.

### Database

The schema lives in `backend/supabase/migrations/` as numbered SQL files and is checked
into git. It is a deliverable, not something that exists only in the Supabase console.

There is no migration CLI wired up yet. To apply a migration, paste the file into the
Supabase SQL editor and run it, in order. Number new files sequentially (the next one is
`0007_...sql`) and never edit one that has already been applied to the shared database.
Write a new file instead.

| File | What it holds |
|---|---|
| `0001_init.sql` | every table, enum and constraint in the schema |
| `0002_keepalive.sql` | the one-row `keepalive` table the GitHub Actions ping reads |
| `0003_book_seat.sql` | `book_seat`, `cancel_booking` |
| `0004_complete_ride.sql` | `complete_ride` |
| `0005_buy_accessory.sql` | `buy_accessory` |
| `0006_seed_accessories.sql` | the twelve shop items. Data, not schema, and not safe to run twice |

Three of the migrations hold functions rather than tables, all called over RPC, all for
the same reason: each is a read-decide-write on something two requests can collide over,
and application code has a gap between the read and the write that a second request fits
inside. A `SELECT ... FOR UPDATE` in a database transaction is the only thing that
closes it; `threading.Lock` would protect one uvicorn worker out of however many are
running.

| Function | Guards |
|---|---|
| `book_seat`, `cancel_booking` | the seat count, against two passengers claiming the last seat |
| `complete_ride` | paying for a ride twice. A non-null `rides.co2_saved` is the marker that it has been paid, so two taps give one payout and two 200s |
| `buy_accessory` | the points balance, against two taps on *Buy* both passing one check |

Each returns a result word (`'seat_taken'`, `'already_completed'`, `'insufficient_points'`)
rather than raising, and the repository maps the word to a domain error. Postgres exceptions
do not survive the trip through PostgREST in a form worth switching on.

### Reference data

A new database needs three things loaded before the app is fully usable.

**The vehicle lookup table** (optional: drivers can always type consumption by hand):

```bash
cd backend
uv sync --group seed                        # pandas, only needed for this
uv run python scripts/prepare_vehicle_reference.py
uv run python scripts/seed_vehicle_reference.py
```

The source is Canadian NRCan data, so MG, GWM, BYD, LDV, Chery, Haval and most utes are
missing. See `docs/vehicle-reference-dataset.md`.

**Today's fuel prices** (required: without a row, every comparison is a 404):

```bash
uv run python -m scripts.fetch_fuel_prices
```

Three rows into `fuel_prices` - petrol, diesel, hybrid - the statewide median from Servo
Saver in dollars per litre. Comparisons read the newest row and never call the API
themselves. In production `.github/workflows/fuel-prices.yml` runs this every morning.

**The campus route cache** (strongly recommended):

```bash
uv run python -m scripts.warm_route_cache
```

Twenty driving routes, one per ordered pair of campuses, fetched from the Google Maps
Routes API and cached permanently. `POST /rides` reads `distance_km` from this table, so
on an empty cache every ride creation makes a live call and fails outright when Google is
unreachable. It prints each distance, which is also how you notice a campus address that
geocoded to the wrong building. Transit routes are fetched on first use and refreshed
daily.

---

## Environment variables

### Backend (`backend/.env`)

| Variable | What it is |
|---|---|
| `SUPABASE_URL` | the project URL |
| `SUPABASE_KEY` | the **service role** key. Bypasses row-level security; never let it reach the frontend |
| `SUPABASE_ANON_KEY` | the public anon key, used by the keep-alive |
| `CLERK_PEM_PUBLIC_KEY` | Clerk's RS256 public key. Tokens are verified locally, with no call to Clerk per request |
| `CLERK_ISSUER` | e.g. `https://your-app.clerk.accounts.dev`. Tokens from any other issuer are refused |
| `GOOGLE_MAPS_API_KEY` | Routes API, for driving and transit routes between campuses |
| `SERVO_SAVER_API_KEY` | Victorian fuel prices, used only by the daily fetch |
| `CORS_ORIGINS` | JSON list of the frontend origins allowed to call the API, e.g. `["http://localhost:3000"]` |
| `ENVIRONMENT` | `development` (default) or `production`. Production turns off `/docs` |

### Frontend (`frontend/.env.local`)

| Variable | What it is |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk's public key |
| `CLERK_SECRET_KEY` | Clerk's secret key, used server-side by the Clerk middleware |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` |
| `NEXT_PUBLIC_API_URL` | the backend's origin, with no `/api/v1`, e.g. `http://localhost:8000` |

---

## Backend architecture

Four layers with a strict one-way dependency. **A layer may import from the layers below
it and never from the layers above it.** Almost every review comment on this codebase comes
back to that one rule.

```
backend/
├── app/
│   ├── main.py            entry point: app, CORS, exception handlers, /health
│   ├── api/               HTTP only. no business logic, no database calls
│   │   ├── deps.py        the dependency vocabulary a route can ask for
│   │   ├── router.py      mounts every route under /api/v1
│   │   └── routes/        one module per resource (users.py, rides.py, ...)
│   ├── services/          business logic. knows nothing about HTTP
│   ├── repositories/      every Supabase call, one module per table
│   ├── schemas/           Pydantic models, split by direction
│   ├── exceptions/        domain errors and the handlers that map them to status codes
│   ├── clients/           outbound HTTP: Google Maps, Servo Saver
│   ├── db/client.py       the Supabase client, one per process
│   └── core/              config, security, constants, pure calculations. zero I/O
├── scripts/               one-off data preparation, never imported by the app
├── supabase/migrations/   the schema
└── tests/
    ├── unit/              services and pure functions, no database
    ├── integration/       routes through a TestClient
    └── fixtures/          recorded API responses, so no test calls Google
```

Five rules that follow from the layering:

1. **Routes never contain business logic.** Parse, call one service, return. If a route
   grows an `if` that is not about HTTP, it belongs in a service.
2. **Services never raise `HTTPException`.** They raise `DomainError` subclasses, and one
   handler maps those to status codes. This keeps business logic usable from a script.
3. **Every Supabase call lives in a repository** and returns a domain model, never a raw
   dict.
4. **Constants appear exactly once**, in `core/constants.py`, with the citation inline.
   Never inline an emission factor or a fare in a service.
5. **Where two requests can collide, the database decides.** Booking a seat, completing a
   ride and buying an accessory each live in a Postgres function holding a row lock.
   Read-check-write in a service has a gap between the read and the write, and no amount
   of careful Python closes it - the two requests are separate transactions, possibly in
   separate workers.

---

## Frontend architecture

```
frontend/
├── app/
│   ├── layout.tsx             ClerkProvider, fonts, global styles
│   ├── sign-in/               the Google sign-in page and its OAuth callback
│   ├── onboarding/            phone, home campus and concession, once, after first sign-in
│   └── (app)/                 the signed-in app. the brackets keep it out of the URL
│       ├── page.tsx           home: next trip, impact figures, the pet
│       ├── rides/             find a ride, post a drive (new/), ride detail ([id]/)
│       ├── trips/             my bookings, upcoming and past
│       ├── drives/            my posted drives, with passengers and "Mark complete"
│       ├── vehicles/          my cars
│       ├── rewards/           the pet, stage progress and the shop
│       └── profile/           phone, campus and concession settings
├── components/                shared UI. components/ui/ is the shadcn base layer
├── lib/                       everything that is not a component
└── e2e/api-flow.ts            the API client walked against the real backend
```

| File | Its one job |
|---|---|
| `lib/api.ts` | the only file that talks to the backend. Every request, every response type, mirroring the Pydantic models in snake_case |
| `lib/use-query.ts` | fetch on mount and on demand: a fresh Clerk token per request, cancellation on unmount, retry, and the error message |
| `lib/time.ts` | every date. Search dates and display are always Melbourne time; the API speaks UTC |
| `lib/use-current-user.ts` | the synced user row, shared by the header badge and the pages |
| `proxy.ts` | Clerk's middleware (Next 16 renamed `middleware.ts`). Anything not under `/sign-in` or `/sign-up` needs a session |

Three rules on this side:

1. **Read the bundled docs, not memory.** This Next.js has breaking changes; the guides
   live in `node_modules/next/dist/docs/`.
2. **Every page works at phone width.** Check each change at 390px as well as desktop.
3. **A failed request says why.** Error states pass the API's message as `detail`, so "the
   server is unreachable" and "the server crashed" do not look the same.

---

## Adding a feature

Build bottom-up. The import rule means you cannot write a layer before the one beneath it
exists, so this order is forced rather than a preference. `POST /users/sync` is the
worked example to copy the shape from.

**1. Migration.** Add `supabase/migrations/000N_name.sql`. Decide the columns and
constraints here. Push invariants into the database where it can hold them: the
`UNIQUE` on `users.clerk_id` is what lets two concurrent sign-ins race safely.

**2. Schemas.** In `app/schemas/`, define the domain model that mirrors the table and a
separate response model for what goes on the wire. `User` carries `clerk_id`;
`UserResponse` omits it. Shared literal types go in `schemas/enums.py`.

**3. Repository.** In `app/repositories/`, one module per table. Take the client as the
first argument rather than importing it. Return models, not dicts. Prefer a single
`upsert` over check-then-insert, which has a race window between the two statements.

**4. Service.** In `app/services/`, all the branching. Raise `DomainError` subclasses on
failure. This is the layer worth testing hardest.

**5. Dependency, only if needed.** Most features skip this. Add a name to `api/deps.py`
only when more than one route needs the same prepared value.

**6. Route.** In `app/api/routes/`, thin. Declare what you need in the signature, call one
service, return. Set `response_model` so the framework narrows the output rather than you
remembering to strip fields. A fixed path such as `/compare/route` must be declared before
a parameterised one such as `/compare/{ride_id}`, or the parameter swallows it.

**7. Mount it.** Add two lines to `api/router.py`. Easiest step to forget, and until you do
the route exists but is unreachable.

**8. Frontend.** Add the response type and a thin wrapper to `lib/api.ts`, then fetch it
with `useQuery` from the page.

**9. Tests.** Unit-test the service with fake repositories and no database. Assert the
promise, not the implementation: the user sync test calls `sync` ten times and asserts one
insert, because "safe to call on every page load" is the actual contract. Add a step to
`e2e/api-flow.ts` for anything a page reads.

---

## Before you push

Run in this order, cheapest first. The backend half is exactly what CI runs, so a clean
local run means a green pipeline.

```bash
cd backend
uv run ruff check --fix .          # lint
uv run ruff format .               # format
uv run mypy app tests scripts      # types, strict mode
uv run pytest                      # 311 tests, no database or network
```

```bash
cd frontend
npm run lint
npm run build                      # catches type errors the dev server tolerates
npm run e2e:api                    # the frontend's API client against the real backend
```

`e2e:api` starts the backend itself with a throwaway Clerk key, signs tokens for a driver and
a passenger, and walks the flows the pages use: post a drive, search for it, open it, book
it, see the phone number appear, cancel, see it go; complete a ride and check both accounts
are credited; buy and wear an accessory. Every assertion is a field a page reads, and
everything it writes to the database is deleted at the end. It needs `uv` and the
backend's `.env`, and it is the closest thing to a real user this repo can run. There are
no browser tests: every page sits behind Clerk's Google sign-in, which cannot be automated.

The default test run needs no database or network, which is the point. Tests marked `db`
are excluded by `addopts` and need real Supabase credentials; run them deliberately with
`uv run pytest -m db`. A fake repository cannot reproduce what they test: the 120-ride bulk
test needs real Postgres constraints, and the booking concurrency test needs real
transactions - it fires ten simultaneous requests at a one-seat ride and asserts exactly
one wins. Run those before a push. They are what caught a repository querying a column
that does not exist, which no unit test could see.

Being offline is also the limit: the unit tests cannot catch a mismatch between your
Pydantic models and the real columns. `e2e:api` can, so run it before calling a feature
done.

---

## The API

`docs/api-reference.html` documents every endpoint the app serves, with request and
response shapes, field rules and status codes. Open it in a browser. All routes are under
`/api/v1` and all of them need a Clerk session token.

| Area | Endpoints |
|---|---|
| Users | `POST /users/sync`, `PATCH /users/me` |
| Vehicles | `POST /vehicles`, `GET /vehicles/me`, `GET /vehicles/reference`, `GET /vehicles/reference/similar` |
| Rides | `POST /rides`, `GET /rides/search`, `GET /rides/mine`, `GET /rides/{ride_id}`, `GET /rides/{ride_id}/passengers`, `PATCH /rides/{ride_id}/complete` |
| Bookings | `POST /bookings`, `GET /bookings/me`, `DELETE /bookings/{booking_id}` |
| Comparison | `GET /compare/{ride_id}`, `GET /compare/route` |
| Rewards and pet | `GET /rewards/me`, `GET /pet/me`, `GET /pet/accessories`, `POST /pet/accessories/buy`, `PUT /pet/accessories/{accessory_id}/equip` |

Twenty-two in all. REQ-009 (cost owed) and REQ-012 (messaging) are absent on purpose, both
recorded as out of scope in `docs/build_plan.md`.

Five rules that catch people out:

- **`distance_km` is never sent by a client.** It comes from the cached driving route, and
  `RideCreate` rejects it outright. Every emissions and points figure multiplies it.
- **`departure_at` needs a timezone offset.** `2026-09-10T09:00:00+10:00`, not
  `2026-09-10T09:00`. A wall-clock time with no zone does not name a moment, and a naive
  value is a 422.
- **Search dates are Melbourne dates, responses are UTC.** A 9am ride on the 10th comes
  back as `2026-09-09T23:00:00Z`. Format in `Australia/Melbourne` before displaying.
- **Phone numbers follow seats, in both directions.** `GET /rides/{ride_id}` omits the
  driver's `phone` key entirely until the caller holds a seat - absent, not null - and
  `GET /rides/{ride_id}/passengers` hands the driver their passengers' numbers and nobody
  else's (403). A seat is a booking that is `confirmed` or `completed`; cancelling takes
  the number away again on both sides.
- **Completing a ride is the only thing that pays, and everyone gets the full figure.**
  `PATCH /rides/{ride_id}/complete`, driver only, after departure. A 7.26 kg ride credits
  the driver and *each* passenger 7.26 kg and 726 points - not a share each. Calling it
  twice is a 200 with `already_completed: true` and no second payout.

---

## Deployment

| Piece | Where | How it deploys |
|---|---|---|
| Backend | Render, free plan, Singapore (`monashgo-api`) | `render.yaml`. Every push to `main` that touches `backend/` builds with `uv sync --frozen --no-dev` and starts uvicorn on `$PORT` |
| Frontend | Vercel | every push to `main`. Set the five frontend variables in the Vercel project, with `NEXT_PUBLIC_API_URL` pointing at the Render URL |
| Database | Supabase | migrations by hand in the SQL editor, see [Database](#database) |
| Fuel prices | GitHub Actions, `fuel-prices.yml` | every day at 20:23 UTC, early morning in Melbourne |
| Keep-alive | GitHub Actions, `supabase-keepalive.yml` | a daily `SELECT` so Supabase does not pause the free project |
| CI | GitHub Actions, `ci.yml` | ruff, mypy and pytest on every push to `main` and every pull request |

Secrets the backend needs at runtime are entered in the Render dashboard (`sync: false` in
`render.yaml`), never committed. The two scheduled workflows read theirs from the
repository's GitHub Actions secrets.

Things to know about the deployed setup:

- **`CORS_ORIGINS` must name the real frontend URL.** `render.yaml` sets it to
  `["https://monashgo.vercel.app"]`. If Vercel serves the app from any other address,
  every request from the browser is refused before it reaches the API. Change it in the
  Render dashboard and in `render.yaml` together.
- **The free plan sleeps.** After about 15 minutes with no traffic Render stops the
  instance, and the next request waits up to a minute for it to start.
- **A failed deploy does not take the site down.** Render polls `/health` on the new
  instance and only switches traffic once it answers. If the deploy log shows the server
  starting but no `GET /health` lines before "Timed Out", the check never reached the
  instance: redeploy with **Manual Deploy > Deploy latest commit**.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Could not find the function public.complete_ride` (or `book_seat`, `buy_accessory`) with code `PGRST202` | the migration holding that function has not been run on this database | run the missing file from `backend/supabase/migrations/` in the Supabase SQL editor. If it still fails, run `NOTIFY pgrst, 'reload schema';` |
| Every comparison is a 404 | no fuel price on record yet | `uv run python -m scripts.fetch_fuel_prices` |
| Posting a ride fails with a 502 | the drive route is not cached and Google could not be reached | `uv run python -m scripts.warm_route_cache` |
| Every request fails in the browser but works with `curl` | the frontend's origin is not in `CORS_ORIGINS` | add the exact origin (scheme, host and port) and restart the backend |
| "Can't reach the server" on every card | the backend is not running, or is asleep on Render | start it locally, or wait a minute for Render to wake it |
| The app starts, then exits naming a variable | `.env` is missing a value or has a typo | compare against `.env.sample`; unknown keys are refused on purpose |
| Signed in, then immediately signed out | the Google account is not on a Monash domain | sign in with an `@student.monash.edu` or `@monash.edu` account |

---

## Conventions

**Branches.** Branch off `main`, one branch per sprint or per feature
(`sprint2`, `route-estimate`). Open a PR, do not push to `main`.

**Commits.** Explain the decision, not the diff. The code already says what changed; the
message should say why upsert instead of select-then-insert, or why the rewards row is
created eagerly. Reserve the subject line for a short summary and put the reasoning in the
body.

**Never commit** `.env`, `frontend/.env.local`, or anything under `backend/data/raw/`.
`SUPABASE_KEY` is the service role key, it bypasses row-level security, and it must never
reach the frontend.

**Numbers have one home.** If a number in the code and a number in the proposal disagree,
the proposal wins and the code is the bug - except where `docs/changes.md` records a
deliberate change.

---

## Further reading

| Document | What it is for |
|---|---|
| `CLAUDE.md` | requirements, schema, formulas and architecture rules in one place |
| `docs/proposal.md` | the original proposal, the source of truth for every constant |
| `docs/changes.md` | where and why the implementation departs from the proposal |
| `docs/build_plan.md` | the build order and what is out of scope |
| `docs/api-reference.html` | every endpoint, with examples and status codes |
| `docs/backend-handbook.html` | the backend's layers, explained with diagrams |
| `docs/test-plan.html` | what is tested where, and why |
| `docs/vehicle-reference-dataset.md` | how the vehicle lookup table is built from NRCan data |
| `docs/sprints/` | what each sprint delivered and what it carried forward |
| `docs/git-field-guide.html` | the git workflow this team uses |
