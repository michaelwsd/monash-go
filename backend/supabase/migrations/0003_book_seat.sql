-- Claiming a seat, and giving it back.
--
-- These are the only writes in the product where two users genuinely collide,
-- and the only place the application cannot be trusted to get it right. Doing
-- it in Python means read the seat count, decide, then write - and between the
-- read and the write a second request reads the same count and decides the
-- same thing. Both succeed. One seat, two passengers, or available_seats = -1.
--
-- No amount of careful Python closes that gap, because the two requests are
-- separate transactions, possibly in separate uvicorn workers on separate
-- machines. Only the database can serialise them, which is what FOR UPDATE
-- below does: the second transaction blocks at the SELECT until the first has
-- committed, and then reads the count the first one left behind.
--
-- Proven by tests/integration/test_booking_concurrency.py, which fires ten
-- simultaneous bookings at a one-seat ride and asserts exactly one wins.

-- Both functions report failure by returning a result string rather than by
-- raising. A raise would reach the repository as a PostgREST error body that
-- has to be pattern-matched to tell "ride is full" from "already booked";
-- a returned value maps to a domain error with a dict lookup. The repository
-- stays a repository, and the service keeps its monopoly on raising.
CREATE TYPE booking_result AS ENUM (
    'booked',
    'cancelled',
    'ride_not_found',
    'ride_full',
    'already_booked',
    'booking_not_found'
);


CREATE FUNCTION book_seat(p_ride_id UUID, p_passenger_id UUID)
RETURNS TABLE (result booking_result, booking_id UUID)
LANGUAGE plpgsql
AS $$
DECLARE
    v_seats INTEGER;
    v_booking_id UUID;
BEGIN
    -- The lock. Everything from here until this function returns is one
    -- transaction holding this ride's row, so a second booking for the same
    -- ride waits here rather than reading a stale count. Bookings for a
    -- DIFFERENT ride are untouched - the lock is on the row, not the table.
    SELECT available_seats
      INTO v_seats
      FROM rides
     WHERE id = p_ride_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT 'ride_not_found'::booking_result, NULL::UUID;
        RETURN;
    END IF;

    IF v_seats < 1 THEN
        RETURN QUERY SELECT 'ride_full'::booking_result, NULL::UUID;
        RETURN;
    END IF;

    -- The insert comes BEFORE the decrement, deliberately. bookings has
    -- UNIQUE (ride_id, passenger_id), so a passenger booking twice fails here.
    -- Decrement first and that failure would leave the ride a seat short for a
    -- booking that does not exist.
    --
    -- ON CONFLICT rather than an EXCEPTION block: a caught exception in
    -- PL/pgSQL opens a subtransaction, which is measurably slower and, in a
    -- path this hot, not worth paying for a case that is not exceptional.
    INSERT INTO bookings (ride_id, passenger_id)
    VALUES (p_ride_id, p_passenger_id)
    ON CONFLICT (ride_id, passenger_id) DO NOTHING
    RETURNING id INTO v_booking_id;

    IF v_booking_id IS NULL THEN
        -- The row already existed. It may be a cancelled one, in which case
        -- this is a rebooking: revive it and carry on. A live booking is a
        -- genuine duplicate.
        UPDATE bookings
           SET status = 'confirmed'
         WHERE ride_id = p_ride_id
           AND passenger_id = p_passenger_id
           AND status = 'cancelled'
        RETURNING id INTO v_booking_id;

        IF v_booking_id IS NULL THEN
            RETURN QUERY SELECT 'already_booked'::booking_result, NULL::UUID;
            RETURN;
        END IF;
    END IF;

    -- v_seats - 1, not available_seats - 1: v_seats was read under the lock,
    -- so it cannot have moved. Either spelling is correct here; this one says
    -- so out loud.
    UPDATE rides
       SET available_seats = v_seats - 1,
           status = CASE WHEN v_seats - 1 = 0 THEN 'full' ELSE status END
     WHERE id = p_ride_id;

    RETURN QUERY SELECT 'booked'::booking_result, v_booking_id;
END;
$$;


-- Cancelling has the same race in reverse: two cancels could each read the
-- same count and each add a seat back, leaving available_seats above
-- total_seats. Same lock, same reason.
CREATE FUNCTION cancel_booking(p_booking_id UUID, p_passenger_id UUID)
RETURNS TABLE (result booking_result, booking_id UUID)
LANGUAGE plpgsql
AS $$
DECLARE
    v_ride_id UUID;
    v_owner UUID;
    v_status booking_status;
    v_seats INTEGER;
    v_total INTEGER;
BEGIN
    -- Read once, unlocked, only to find out which ride to lock.
    SELECT ride_id INTO v_ride_id FROM bookings WHERE id = p_booking_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT 'booking_not_found'::booking_result, NULL::UUID;
        RETURN;
    END IF;

    -- The ride lock is taken FIRST, before the booking row, and book_seat does
    -- the same. Two functions that take the same two locks in opposite orders
    -- deadlock: a booking holding the ride and waiting for the booking row,
    -- against a cancel holding the booking row and waiting for the ride.
    -- Consistent ordering is the whole defence.
    SELECT available_seats, total_seats
      INTO v_seats, v_total
      FROM rides
     WHERE id = v_ride_id
       FOR UPDATE;

    -- Re-read the booking under the lock. The unlocked read above may already
    -- be stale: a second cancel could have committed in between, and acting on
    -- what we saw then would hand back a second seat for one cancellation.
    SELECT passenger_id, status
      INTO v_owner, v_status
      FROM bookings
     WHERE id = p_booking_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT 'booking_not_found'::booking_result, NULL::UUID;
        RETURN;
    END IF;

    -- Someone else's booking is reported as not found rather than as a refusal
    -- to act: "that booking exists but is not yours" confirms the id is real,
    -- which is more than a stranger needs to know.
    IF v_owner <> p_passenger_id THEN
        RETURN QUERY SELECT 'booking_not_found'::booking_result, NULL::UUID;
        RETURN;
    END IF;

    -- Cancelling twice is not an error, but it must not hand back a second
    -- seat. Returning early is what makes this idempotent.
    IF v_status = 'cancelled' THEN
        RETURN QUERY SELECT 'cancelled'::booking_result, p_booking_id;
        RETURN;
    END IF;

    UPDATE bookings SET status = 'cancelled' WHERE id = p_booking_id;

    -- LEAST guards the check constraint on rides: available_seats may never
    -- exceed total_seats, and a restore that overshot would abort the whole
    -- transaction rather than fail politely.
    --
    -- The status flip back to 'open' is the half that is easy to forget. A
    -- ride left at 'full' with a free seat is invisible to GET /rides/search
    -- forever, so the seat comes back and nobody can ever see it.
    UPDATE rides
       SET available_seats = LEAST(v_seats + 1, v_total),
           status = CASE WHEN status = 'full' THEN 'open' ELSE status END
     WHERE id = v_ride_id;

    RETURN QUERY SELECT 'cancelled'::booking_result, p_booking_id;
END;
$$;
