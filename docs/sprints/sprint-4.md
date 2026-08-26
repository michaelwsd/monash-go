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
- `app/api/v1/bookings.py` — `POST /bookings`, `DELETE /bookings/{id}`, `GET /bookings/me`.
- The phone-number rule is enforced by which response schema a route declares (`CLAUDE.md`'s
  standing rule: "Every route declares its response schema. That is what stops a phone number
  leaking.") — don't reach for a manual `if` that strips the field ad hoc, use two distinct response
  schemas (with/without phone) and pick the right one based on booking status.

## Definition of done

- [ ] `test_booking_concurrency.py` passes repeatedly, not just once
- [ ] `available_seats` never goes negative under deliberate concurrent abuse
- [ ] `test_booking_service.py` and `test_bookings_endpoint.py` pass, including the cancel-then-
      rebook round trip
- [ ] Phone number confirmed absent pre-booking and present post-confirmation, via an actual
      response-shape assertion
- [ ] REQ-003 acceptance criteria fully met (this sprint completes what Sprint 3 started)

## Explicitly not in this sprint

- No comparison dashboard, no rewards — a completed ride doesn't yet award anything. That's
  Sprint 5 and Sprint 6.
