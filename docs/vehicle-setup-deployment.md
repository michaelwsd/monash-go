# Vehicle Setup Deployment

This first release is a responsive Next.js vehicle-registration page backed by FastAPI,
Supabase, and Clerk. It is designed to grow into the rest of MonashGO without moving
the vehicle code: the frontend calls the versioned API through `frontend/lib/api.ts`,
and FastAPI keeps route, service, and repository layers separate.

## Before first deploy

1. Create a Clerk application and enable the Monash sign-in method you intend to use.
   Add both `@student.monash.edu` and `@monash.edu` to the allowed account policy. In Clerk's
   **Sessions > Customize session token** claims editor, add these signed claims to the normal
   session token:
   ```json
   {
     "email": "{{user.primary_email_address}}",
     "full_name": "{{user.first_name}} {{user.last_name}}"
   }
   ```
   The API verifies these claims during `/api/v1/users/sync`.
2. Put Clerk's PEM public key and issuer in the backend environment. Put only the
   publishable key in the frontend environment. Never expose `SUPABASE_KEY` or
   `CLERK_SECRET_KEY` to the browser.
3. Apply the database schema and the lookup migration from `backend/supabase/migrations`.
   Then run `backend/scripts/seed_vehicle_reference.py` so the reference selectors have data.
4. Set `CORS_ORIGINS` to the exact deployed frontend URL, formatted as JSON, for example
   `["https://your-project.vercel.app"]`.

## Low-friction hosting

Use Vercel for `frontend` and Render for `backend`:

1. In Vercel, import this repository and select `frontend` as the Root Directory. It detects
   Next.js automatically. Add `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `NEXT_PUBLIC_API_URL`.
2. In Render, create a Blueprint from this repository. `render.yaml` creates the FastAPI web
   service and asks you for the secrets rather than storing them in Git.
3. After Render assigns an `onrender.com` URL, update Vercel's `NEXT_PUBLIC_API_URL`, update
   Render's `CORS_ORIGINS`, and add the Vercel URL to Clerk's allowed origins and redirect URLs.

Vercel's Git integration creates preview deployments for changes, while Render's free web
services are suitable for demos but can sleep after inactivity. The first request after sleep
may take longer. Treat this as a course-project deployment, not a production SLA.

## Release workflow

Follow this order for each deployment. The database is first because the API cannot serve the
vehicle picker until its reference table and lookup functions exist.

1. Run the local verification commands below and commit the changes that pass them.
2. In Supabase SQL Editor, run `0001_init.sql`, then `0002_vehicle_reference_lookup.sql` from
   `backend/supabase/migrations/`, in that order. Do not re-run a migration already applied to
   a shared project.
3. From `backend`, install the seed dependency with `uv sync --group seed`, then run
   `uv run python scripts/seed_vehicle_reference.py`. It confirms the expected row count and
   that electric rows have no engine size.
4. Create the Render Blueprint from `render.yaml`. Set every requested backend variable:
   `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_ANON_KEY`, `CLERK_PEM_PUBLIC_KEY`,
   `CLERK_ISSUER`, `GOOGLE_MAPS_API_KEY`, `SERVO_SAVER_API_KEY`, and `CORS_ORIGINS`.
   Use `https://your-frontend.vercel.app` as the CORS origin after Vercel creates it.
5. Confirm `https://your-api.onrender.com/health` returns HTTP 200 before deploying the
   frontend. A free Render service may need a short warm-up after sleeping.
6. Import the repository into Vercel with `frontend` as its Root Directory. Set
   `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and
   `NEXT_PUBLIC_API_URL=https://your-api.onrender.com`.
7. Add the Vercel URL to Clerk's allowed origins and redirect URLs, then update Render's
   `CORS_ORIGINS` with that exact URL. Redeploy both services after changing these values.
8. Sign in on the deployed frontend, register one catalogue vehicle and one manual vehicle,
   and confirm both appear under "Your registered vehicles" after a refresh.

## What to run now

These commands do not require a deployed Supabase, Clerk, or hosting account:

```powershell
# Backend: lint, type checks, and all API/service tests
cd backend
uv run ruff check app tests
uv run mypy app tests scripts
uv run pytest

# Frontend: lint and the production build Vercel will run
cd ../frontend
pnpm lint
pnpm build
```

If `pnpm` refuses to run because of a registry-signature check, use the already-installed
project binaries to distinguish that tooling problem from an application failure:

```powershell
.\node_modules\.bin\eslint.cmd .
.\node_modules\.bin\next.cmd build
```

After the database and environment are configured, run the backend locally with
`uv run uvicorn app.main:app --reload` and the frontend with `pnpm dev`. Verify
`http://localhost:8000/health`, then exercise the vehicle picker and manual-entry paths in
the browser. The unauthenticated API calls should return 401; sign in through Clerk before
testing registration.

## Local run

1. Copy `backend/.env.sample` to `backend/.env` and replace all placeholders.
2. Copy `frontend/.env.sample` to `frontend/.env.local` and replace the Clerk publishable key.
3. Run `uv run uvicorn app.main:app --reload` from `backend`.
4. Run `pnpm dev` from `frontend` and open `http://localhost:3000`.
