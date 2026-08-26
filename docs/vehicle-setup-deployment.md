# Vehicle Setup Deployment

This first release is a responsive Next.js vehicle-registration page backed by FastAPI,
Supabase, and Clerk. It is designed to grow into the rest of MonashGO without moving
the vehicle code: the frontend calls the versioned API through `frontend/lib/api.ts`,
and FastAPI keeps route, service, and repository layers separate.

## Before first deploy

1. Create a Clerk application and enable the Monash sign-in method you intend to use.
   Add both `@student.monash.edu` and `@monash.edu` to the allowed account policy. The
   API repeats this check during `/api/v1/users/sync`.
2. Put Clerk's PEM public key and issuer in the backend environment. Put only the
   publishable key in the frontend environment. Never expose `SUPABASE_KEY` to the browser.
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

## Local run

1. Copy `backend/.env.sample` to `backend/.env` and replace all placeholders.
2. Copy `frontend/.env.sample` to `frontend/.env.local` and replace the Clerk publishable key.
3. Run `uv run uvicorn app.main:app --reload` from `backend`.
4. Run `pnpm dev` from `frontend` and open `http://localhost:3000`.
