-- Buying a pet accessory.
--
-- The same shape as book_seat: read a balance, decide, write. Two taps on Buy
-- would both read the same balance and both pass the check, and the user would
-- own two items for the price of one. The lock is on the user's own row, so it
-- never blocks anyone else's purchase.
--
-- UNIQUE (user_id, accessory_id) already stops owning the same item twice; this
-- function turns that collision into a word rather than a constraint violation.

CREATE TYPE purchase_result AS ENUM (
    'bought',
    'accessory_not_found',
    'already_owned',
    'stage_locked',
    'insufficient_points'
);


CREATE FUNCTION buy_accessory(p_user_id UUID, p_accessory_id UUID)
RETURNS TABLE (result purchase_result, balance INTEGER)
LANGUAGE plpgsql
AS $$
DECLARE
    v_cost INTEGER;
    v_required pet_stage;
    v_stage pet_stage;
    v_points INTEGER;
BEGIN
    SELECT cost, required_stage
      INTO v_cost, v_required
      FROM accessories
     WHERE id = p_accessory_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT 'accessory_not_found'::purchase_result, 0;
        RETURN;
    END IF;

    -- The balance is locked before it is read, so a second purchase waits here
    -- and then reads what the first one left behind.
    SELECT green_points INTO v_points FROM users WHERE id = p_user_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT 'accessory_not_found'::purchase_result, 0;
        RETURN;
    END IF;

    SELECT pet_stage INTO v_stage FROM rewards WHERE user_id = p_user_id;

    IF EXISTS (
        SELECT 1 FROM pet_accessories
         WHERE user_id = p_user_id AND accessory_id = p_accessory_id
    ) THEN
        RETURN QUERY SELECT 'already_owned'::purchase_result, v_points;
        RETURN;
    END IF;

    -- pet_stage is an ordered enum, so Postgres compares the stages directly:
    -- 'egg' < 'hatched' < 'juvenile' < 'adult' < 'legendary' is the order they
    -- were declared in, in 0001_init.sql.
    IF v_stage IS NULL OR v_stage < v_required THEN
        RETURN QUERY SELECT 'stage_locked'::purchase_result, v_points;
        RETURN;
    END IF;

    IF v_points < v_cost THEN
        RETURN QUERY SELECT 'insufficient_points'::purchase_result, v_points;
        RETURN;
    END IF;

    UPDATE users SET green_points = v_points - v_cost WHERE id = p_user_id;
    INSERT INTO pet_accessories (user_id, accessory_id) VALUES (p_user_id, p_accessory_id);

    RETURN QUERY SELECT 'bought'::purchase_result, v_points - v_cost;
END;
$$;
