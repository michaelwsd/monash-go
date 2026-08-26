-- Server-side DISTINCT queries keep the vehicle-picker responses compact even
-- though the reference catalogue contains many rows for each make and model.

CREATE FUNCTION vehicle_reference_makes()
RETURNS TABLE (make TEXT)
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT DISTINCT vr.make
    FROM vehicle_reference AS vr
    ORDER BY vr.make;
$$;

CREATE FUNCTION vehicle_reference_models(p_make TEXT)
RETURNS TABLE (model TEXT)
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT DISTINCT vr.model
    FROM vehicle_reference AS vr
    WHERE vr.make = p_make
    ORDER BY vr.model;
$$;

CREATE FUNCTION vehicle_reference_years(p_make TEXT, p_model TEXT)
RETURNS TABLE (year INTEGER)
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT DISTINCT vr.year
    FROM vehicle_reference AS vr
    WHERE vr.make = p_make AND vr.model = p_model
    ORDER BY vr.year DESC;
$$;

CREATE FUNCTION vehicle_reference_options(p_make TEXT, p_model TEXT, p_year INTEGER)
RETURNS TABLE (
    id INTEGER,
    make TEXT,
    model TEXT,
    year INTEGER,
    fuel_type fuel_type,
    engine_size DOUBLE PRECISION,
    avg_consumption DOUBLE PRECISION
)
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT vr.id, vr.make, vr.model, vr.year, vr.fuel_type, vr.engine_size, vr.avg_consumption
    FROM vehicle_reference AS vr
    WHERE vr.make = p_make AND vr.model = p_model AND vr.year = p_year
    ORDER BY vr.fuel_type, vr.engine_size NULLS FIRST;
$$;
