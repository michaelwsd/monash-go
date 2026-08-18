# MonashGO

A green ride-sharing platform for Monash students and staff. Passengers find carpools
between campuses, the app compares that trip against public transport and driving alone,
and the CO2 avoided turns into green points and a pet that evolves.

| | |
|---|---|
| Frontend | Next.js 16 / React 19 / TypeScript / Tailwind 4 |
| Backend | Python 3.12 / FastAPI |
| Database | Supabase (PostgreSQL) |
| Auth | Clerk, Google OAuth restricted to `student.monash.edu` and `monash.edu` |

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
```

`.env.sample` lists nine variables. Eight are required; `ENVIRONMENT` defaults to
`development` if you leave it out. `Settings` is built at import time and forbids unknown
keys, so a missing or misspelled variable fails immediately and loudly rather than at the
first request.

Run it:

```bash
uv run uvicorn app.main:app --reload
```

- API: `http://localhost:8000/api/v1`
- Interactive docs: `http://localhost:8000/docs` (disabled when `ENVIRONMENT=production`)
- Health check: `http://localhost:8000/health`

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
Supabase SQL editor and run it. Number new files sequentially (`0002_...sql`) and never
edit one that has already been applied to the shared database. Write a new file instead.

To populate the vehicle lookup table:

```bash
cd backend
uv sync --group seed                        # pandas, only needed for this
uv run python scripts/prepare_vehicle_reference.py
uv run python scripts/seed_vehicle_reference.py
```

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
│   ├── db/client.py       the Supabase client, one per process
│   └── core/              config, security, constants, pure calculations. zero I/O
├── scripts/               one-off data preparation, never imported by the app
├── supabase/migrations/   the schema
└── tests/
    ├── unit/              services and pure functions, no database
    └── integration/       routes through a TestClient
```

Four rules that follow from the layering:

1. **Routes never contain business logic.** Parse, call one service, return. If a route
   grows an `if` that is not about HTTP, it belongs in a service.
2. **Services never raise `HTTPException`.** They raise `DomainError` subclasses, and one
   handler maps those to status codes. This keeps business logic usable from a script.
3. **Every Supabase call lives in a repository** and returns a domain model, never a raw
   dict.
4. **Constants appear exactly once**, in `core/constants.py`, with the citation inline.
   Never inline an emission factor or a fare in a service.

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
remembering to strip fields.

**7. Mount it.** Add two lines to `api/router.py`. Easiest step to forget, and until you do
the route exists but is unreachable.

**8. Tests.** Unit-test the service with fake repositories and no database. Assert the
promise, not the implementation: the user sync test calls `sync` ten times and asserts one
insert, because "safe to call on every page load" is the actual contract.

---

## Before you push

Run in this order, cheapest first. This is exactly what CI runs, so a clean local run means
a green pipeline.

```bash
cd backend
uv run ruff check --fix .          # lint
uv run ruff format .               # format
uv run mypy app tests scripts      # types, strict mode
uv run pytest                      # tests
```

```bash
cd frontend
npm run lint
npm run build                      # catches type errors the dev server tolerates
```

The whole suite runs without a database or a network, which is the point. It also means
the tests cannot catch a mismatch between your Pydantic models and the real columns, so
make one real request against Supabase before calling a feature done:

```bash
curl -i -X POST localhost:8000/api/v1/users/sync   # expect 401 with no token
curl -i -X POST localhost:8000/api/v1/users/sync -H "Authorization: Bearer $TOKEN"
```

Grab `$TOKEN` from the browser devtools on a signed-in frontend session.

---

## Conventions

**Branches.** Branch off `main`, one branch per sprint or per feature
(`sprint2`, `error_handler`). Open a PR, do not push to `main`.

**Commits.** Explain the decision, not the diff. The code already says what changed; the
message should say why upsert instead of select-then-insert, or why the rewards row is
created eagerly. Reserve the subject line for a short summary and put the reasoning in the
body.

**Never commit** `.env`, `frontend/.env.local`, or anything under `backend/data/raw/`.
`SUPABASE_KEY` is the service role key, it bypasses row-level security, and it must never
reach the frontend, which gets `SUPABASE_ANON_KEY` instead.

**Background reading.** `docs/proposal.md` is the source of truth for every constant and
formula. `docs/changes.md` records where the implementation deliberately diverges from it
and why. If a number in the code and a number in the proposal disagree, the proposal wins
and the code is the bug.
