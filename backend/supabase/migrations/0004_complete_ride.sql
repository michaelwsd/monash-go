-- Marking a ride finished, and paying out for it.
--
-- Points are currency. Awarding them twice leaves a balance permanently wrong
-- with no ledger to unwind, and a single completion touches N+1 user rows -
-- the driver and every passenger - so a half-finished payout would credit some
-- people and not others. Both problems are the same problem: this has to be one
-- transaction that either happens completely or not at all.
--
-- rides.co2_saved being non-null is the marker that payment already happened
-- (CLAUDE.md). It is checked under the same lock that writes it, so two taps on
-- "Mark complete" cannot both pass the check.
--
-- The figures are not computed here. co2_avoided() and points_earned() live in
-- core/ where they are unit tested against the worked examples in
-- docs/changes.md, and the service passes the results in. SQL does the atomic
-- write; Python does the arithmetic. Duplicating the formula here would mean
-- two places to change an emission factor.

CREATE TYPE completion_result AS ENUM (
    'completed',
    'ride_not_found',
    'not_your_ride',
    'not_departed',
    'already_completed'
);


CREATE FUNCTION complete_ride(
    p_ride_id UUID,
    p_driver_id UUID,
    p_co2_saved DOUBLE PRECISION,
    p_points INTEGER
)
RETURNS TABLE (result completion_result, credited INTEGER)
LANGUAGE plpgsql
AS $$
DECLARE
    v_driver_id UUID;
    v_departure TIMESTAMPTZ;
    v_co2 DOUBLE PRECISION;
    v_credited INTEGER;
BEGIN
    SELECT driver_id, departure_at, co2_saved
      INTO v_driver_id, v_departure, v_co2
      FROM rides
     WHERE id = p_ride_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT 'ride_not_found'::completion_result, 0;
        RETURN;
    END IF;

    -- Only the driver was there. A passenger marking a ride complete would be
    -- awarding themselves points for a trip that may not have happened.
    IF v_driver_id <> p_driver_id THEN
        RETURN QUERY SELECT 'not_your_ride'::completion_result, 0;
        RETURN;
    END IF;

    IF v_departure > now() THEN
        RETURN QUERY SELECT 'not_departed'::completion_result, 0;
        RETURN;
    END IF;

    -- The idempotency check, under the lock. A second tap reads the co2_saved
    -- the first one wrote and stops here.
    IF v_co2 IS NOT NULL THEN
        RETURN QUERY SELECT 'already_completed'::completion_result, 0;
        RETURN;
    END IF;

    UPDATE rides
       SET status = 'completed',
           co2_saved = p_co2_saved,
           points_earned = p_points
     WHERE id = p_ride_id;

    -- Passengers first: the booking rows move to 'completed' and their owners
    -- are credited. 'confirmed' only - a cancelled seat was not travelled in.
    UPDATE bookings
       SET status = 'completed'
     WHERE ride_id = p_ride_id
       AND status = 'confirmed';

    GET DIAGNOSTICS v_credited = ROW_COUNT;

    -- Everyone who made the trip happen is credited the ride's full figure,
    -- driver included: it is a reward for carpooling, not an apportioning of
    -- carbon. Summed across users it therefore exceeds the CO2 actually
    -- avoided, which is intended and is stated in CLAUDE.md.
    UPDATE users
       SET green_points = green_points + p_points
     WHERE id = p_driver_id
        OR id IN (
            SELECT passenger_id FROM bookings
             WHERE ride_id = p_ride_id AND status = 'completed'
        );

    UPDATE rewards
       SET total_co2_saved = total_co2_saved + p_co2_saved
     WHERE user_id = p_driver_id
        OR user_id IN (
            SELECT passenger_id FROM bookings
             WHERE ride_id = p_ride_id AND status = 'completed'
        );

    -- The driver is not a passenger, so the count returned is the number of
    -- seats that were travelled in; the service adds one for the driver when
    -- it recomputes pet stages.
    RETURN QUERY SELECT 'completed'::completion_result, v_credited;
END;
$$;
