# Sprint 4 — Bookings

**Dates:** 25/09/26 – 09/10/26 (planned)
**Build order reference:** `build_plan.md` Step 6
**Builds toward:** REQ-003 (completes it — search was Sprint 3, this sprint adds booking)
**Depends on:** Sprint 3's rides

## Goal

Passengers claim seats. This is the only place in the product where two users can genuinely
collide — two people booking the last seat at once — so it's the only place that needs real
concurrency control, not just careful-looking application code.

## Why the test comes before the SQL function

Read-check-write in application code has a window between the read and the write. Two requests for
the last seat can both see `available_seats = 1`, both decrement, and produce either two bookings
on one seat or `available_seats = -1`. This is exactly the kind of bug that *looks* fine in every
manual test and only shows up under real concurrent load — which is why the concurrency test has to
exist and fail first, then drive the implementation, rather than being an afterthought written
after the code "looks right".

## Test-driven build order

### 1. The concurrency test — write this before the Postgres function exists

**Write first**, in `tests/integration/test_booking_concurrency.py`:
- Create a ride with exactly 1 available seat.
- Fire N (say, 10) simultaneous booking requests against it — using `asyncio.gather` with an async
  test client, or a thread pool if the stack makes that easier.
- Assert exactly one request succeeds (201) and the rest fail cleanly with a domain error (409 or
  similar via `RideFullError`), not a 500 or a silent double-booking.
- Assert `available_seats` is never negative, under repeated runs of this test, not just once —
  concurrency bugs are flaky by nature, run it a handful of times before trusting it.

This test will fail (or not even compile against real infrastructure) until the row-locking
function below exists. That's expected — it's the target you're building toward, not a mistake.

### 2. Row-level locking function

**Then implement:**
- A Postgres function using `SELECT ... FOR UPDATE` inside a transaction, checked into
  `supabase/migrations/0002_book_seat.sql`. This has to be a database-level lock — no amount of
  careful Python avoids the race, because the race is between two separate requests each with their
  own read-then-write, and only the database can serialise that.
- `app/repositories/booking_repository.py` — calls the function via Supabase RPC, does not
  reimplement the check-then-write pattern in Python.

### 3. Booking service and routes

**Write first**, in `tests/unit/test_booking_service.py` (fake repository) and
`tests/integration/test_bookings_endpoint.py`:
- Booking a full ride raises `RideFullError`.
- Booking the same ride twice as the same passenger raises `AlreadyBookedError`.
- Cancelling a booking (`DELETE /bookings/{id}`) restores the seat — write this as an integration
  test that books, cancels, then re-books successfully, proving the seat count round-trips
  correctly rather than just checking the cancel call returns 200.
- **The phone number rule**: a driver's phone number is absent from `GET /rides/search` and
  `GET /rides/{id}` responses until the requesting user has a *confirmed* booking on that ride.
  Write this as a schema-level test — assert the field is genuinely missing from the serialised
  response, not just `null`, before any booking exists, and present after.

**Then implement:**
- `app/services/booking_service.py` — raises `RideFullError`, `AlreadyBookedError`.
- `app/api/routes/bookings.py` — `POST /bookings`, `DELETE /bookings/{id}`, `GET /bookings/me`.
- The phone-number rule is enforced by which response schema a route declares (`CLAUDE.md`'s
  standing rule: "Every route declares its response schema. That is what stops a phone number
  leaking.") — don't reach for a manual `if` that strips the field ad hoc, use two distinct response
  schemas (with/without phone) and pick the right one based on booking status.

**Sprint complete, 13/09/26.** 200 tests pass in the default run, seven more behind
`uv run pytest -m db`, and the ten-way race has been run repeatedly without a flake.

### Decisions taken while building

**The SQL functions report failure by returning a word, not by raising.** `book_seat` and
`cancel_booking` answer with a `booking_result` enum - `booked`, `ride_full`, `already_booked`,
`ride_not_found`, `booking_not_found`. A `RAISE EXCEPTION` would reach the repository as a
PostgREST error body that has to be pattern-matched to tell one failure from another; a returned
value is a dict lookup. The repository stays a repository and the service keeps its monopoly on
raising, which is the layering rule everywhere else in the codebase.

**Both functions take the ride lock before the booking row.** The first draft of `cancel_booking`
read the booking and then locked the ride, the opposite order from `book_seat`. Two functions
taking the same two locks in opposite orders deadlock. Consistent ordering is the whole defence,
and it is worth a comment in any function added here later.

**Cancelling is idempotent, and rebooking revives.** A second cancel returns `cancelled` without
handing back a second seat, and booking a ride you previously cancelled flips the existing row
back to `confirmed` rather than colliding with `UNIQUE (ride_id, passenger_id)`.

**The cancel path also flips `rides.status` back to `open`.** Easy to miss and silent when missed:
a ride left at `full` with a free seat never appears in `GET /rides/search` again.

**One `TestClient` per thread in the concurrency test.** `TestClient` drives the ASGI app through
a single blocking portal, and ten threads pushing requests into one instance corrupt each other's
transport - it fails with `RemoteProtocolError: Server disconnected` before any booking code runs.
The client is built inside each thread, before the barrier, so it does not stagger the requests.

**`GET /rides/{ride_id}` sets `response_model=None`.** The phone rule is enforced by which model
the service builds - `RideDetail` has no phone field, `RideDetailWithContact` does. A declared
`response_model` would coerce the second back into the first and strip the number, which is
exactly the bug the endpoint must not have.

### Bugs this sprint surfaced elsewhere

`ride_repository.get_ride` queried `eq("ride_id", ...)` on the `rides` table, which has no such
column - `GET /rides/{ride_id}` had been broken since Sprint 3. mypy cannot see it, because the
column name is only a string, and every unit test fakes the repository. Only a query against real
Postgres could find it, which is an argument for the `db`-marked tests.

## Definition of done

- [x] `test_booking_concurrency.py` passes repeatedly, not just once
- [x] `available_seats` never goes negative under deliberate concurrent abuse
- [x] `test_booking_service.py` and `test_bookings_endpoint.py` pass, including the cancel-then-
      rebook round trip
- [x] Phone number confirmed absent pre-booking and present post-confirmation, via an actual
      response-shape assertion
- [x] REQ-003 acceptance criteria fully met (this sprint completes what Sprint 3 started)

## Carried into Sprint 5

- **The migration is applied by hand.** `0003_book_seat.sql` was pasted into the Supabase SQL
  editor. There is still no migration CLI, so a fresh database needs all three files run in order.
- **Sprint 3's carried items are still open**: the pet stage thresholds have not been re-checked
  against the real seeded distances, `ride_repository.get_ride` should be `get_by_id` to match the
  other repositories, and `pandas` is still declared twice in `pyproject.toml`.
- **`GET /bookings/me` returns bookings, not trips.** It carries a `ride_id` and no route, time or
  driver, so a trips screen has to follow each booking to `GET /rides/{ride_id}`. If that proves
  awkward for the frontend, a joined response belongs in Sprint 5 rather than being bolted on here.
- **`GET /rides/mine` was added after the sprint closed** (13/09/26), because the frontend's My
  drives page had no way to list a driver's own rides. Repository `list_for_driver`, service
  `list_for_driver`, route registered before `/{ride_id}`, covered at both layers and in the
  frontend's `e2e:api` flow. The as-driver half of artboard 1j is buildable now.
- **No `DELETE /vehicles/{id}`.** The frontend's My cars page has no way to remove a car.
  `rides.vehicle_id` is `ON DELETE RESTRICT`, so a car that has ever carried a ride cannot be hard
  deleted; a soft delete (`archived_at`, hidden from `GET /vehicles/me`) keeps ride history intact,
  and ride history is what the emissions and points figures are built from.

## Explicitly not in this sprint

- No comparison dashboard, no rewards — a completed ride doesn't yet award anything. That's
  Sprint 5 and Sprint 6.
