# Sprint 1 — Database client & Clerk auth

**Dates:** 03/08/26 – 17/08/26 (active)
**Build order reference:** `build_plan.md` Step 1
**Builds toward:** the foundation REQ-001 depends on (the sync endpoint itself lands in Sprint 2)
**Depends on:** Sprint 0 (schema, CI, tooling) — complete

Read `CLAUDE.md` in full before starting. It is the source of truth for the schema, endpoints and
constants referenced below; this document only adds sprint-level sequencing and the TDD discipline.

## Goal

Two things every later endpoint needs: a way to reach Supabase, and a way to know *who is calling*.
By the end of this sprint, code elsewhere can declare `user: CurrentUser` and trust that an
authenticated Monash user is behind the request, with no auth logic of its own.

## Why test-first matters here specifically

This is the riskiest code in the whole project — a bug here is an authentication bypass, not a
cosmetic defect. Write the attack cases (expired, wrong issuer, tampered signature, missing header)
as failing tests *before* `core/security.py` exists. If you write the implementation first, it is
too easy to only test the happy path and never notice the tampered-signature case doesn't actually
get rejected.

**Discipline for every component below:** write the failing test first, run it, confirm it fails for
the *reason you expect* (not an import error), then write the minimum code to make it pass, then
refactor. Before every commit: `uv run ruff format .`, `uv run ruff check .`, `uv run mypy .`,
`uv run pytest`. CI rejects anything that doesn't pass all four — don't find that out after pushing.

## Test-driven build order

### 1. Domain errors & exception handlers (no dependencies — build this first)

Services must never raise `HTTPException` directly (`CLAUDE.md`, Key Design Decisions). Build the
translation layer before anything needs to raise through it.

**Write first**, in a new `tests/unit/test_exceptions.py`:
- A `DomainError` raised inside a throwaway route (defined in the test, not in `app/`) is caught by
  a registered handler and returns a JSON body, not an unhandled 500.
- `NotFoundError` maps to 404.
- `PermissionDeniedError` maps to 403.

**Then implement:**
- `app/exceptions/errors.py` — `DomainError` base class, `NotFoundError(DomainError)`,
  `PermissionDeniedError(DomainError)`.
- `app/exceptions/handlers.py` — one handler per error type (or one generic handler keyed on a
  `status_code` attribute on `DomainError` subclasses — your call, but keep it to one mapping
  table, not a chain of `isinstance` checks).
- Register the handlers in `app/main.py` via `app.add_exception_handler(...)`.

### 2. Supabase client

**Write first**, in `tests/unit/test_db_client.py`:
- Calling `get_supabase()` twice returns the *same object* (proves `@lru_cache` is wired, not just
  present). Monkeypatch `supabase.create_client` so the test doesn't hit the network.
- `get_supabase()` is called with the URL and key from `Settings`, not hardcoded strings.

**Then implement:**
- `app/db/client.py` — `get_supabase() -> Client`, cached with `@lru_cache`, reading
  `settings.supabase_url` / `settings.supabase_key` via `get_settings()`.
- Add `SupabaseDep = Annotated[Client, Depends(get_supabase)]` to `app/api/deps.py`, next to the
  existing `SettingsDep`.

One client per process. A client created per request exhausts connections — this is a documented
gotcha in `build_plan.md`'s notes for this step, don't rediscover it the hard way.

### 3. Clerk JWT verification — the core of this sprint

**Write first**, in `tests/unit/test_security.py`. Add a `conftest.py` fixture that generates an
RSA keypair once per test session (`cryptography.hazmat` or `pyjwt`'s test helpers) and a helper
that signs a token with arbitrary claims/expiry/issuer. Tests needed, all against your own
self-signed tokens, no network calls:
- A validly signed, unexpired token with the correct issuer returns the `sub` claim.
- An expired token raises (map this to 401 upstream).
- A token signed with the wrong issuer raises.
- A tampered signature (flip a character in the signature segment) raises.
- A missing/malformed `Authorization` header raises.
- Confirm you are **not** checking the `aud` claim — Clerk session tokens don't carry one by
  default (`CLAUDE.md`, Step 1 notes). Add a token with no `aud` and confirm it still passes, so a
  future "helpful" addition of audience checking doesn't silently start rejecting every real user.

**Then implement:**
- `app/core/security.py` — a function (e.g. `verify_clerk_token(token: str) -> str`) that decodes
  and verifies RS256 signature, `iss`, and `exp` using `PyJWT` against `settings.clerk_pem_public_key`
  and `settings.clerk_issuer`, and returns the `sub` claim. No network call to Clerk per request —
  the public key is already in settings.

### 4. `CurrentUser` dependency + proof route

**Write first**, in `tests/integration/test_current_user.py`. Build a *throwaway* `APIRouter` with
one `GET` endpoint depending on `CurrentUser`, mounted on a fresh `FastAPI()` instance created
inside the test (do not add a permanent route to the real app for this — Sprint 2's
`POST /users/sync` is the first real protected endpoint). Assert:
- No `Authorization` header → 401, and the endpoint body is never reached (assert via a side
  effect, e.g. a mock that must not be called).
- A validly signed token → 200, and the endpoint receives the correct `clerk_id`.

**Then implement:**
- Add `CurrentUser = Annotated[str, Depends(get_current_user_id)]` to `app/api/deps.py`, where
  `get_current_user_id` extracts the bearer token from the request, calls
  `verify_clerk_token`, and raises a `DomainError`-compatible auth failure (or lets FastAPI's
  `HTTPException` handle 401 directly here specifically — this is infrastructure, not a service,
  so the "services never raise HTTPException" rule doesn't apply to this one dependency function).

## Definition of done

- [ ] `tests/unit/test_exceptions.py` passes
- [ ] `tests/unit/test_db_client.py` passes
- [ ] `tests/unit/test_security.py` passes — valid, expired, wrong-issuer, tampered, missing-header
- [ ] `tests/integration/test_current_user.py` passes — 401 without a token, 200 with one
- [ ] `uv run ruff check . && uv run mypy . && uv run pytest` all green
- [ ] A garbage token never reaches a handler; a real Clerk token resolves to the correct `clerk_id`

## Explicitly not in this sprint

- No real API endpoint beyond the throwaway test route — that's `POST /users/sync` in Sprint 2.
- No `rewards` row creation, no user table writes at all yet — this sprint proves identity, not
  persistence.
