-- initial schema

CREATE TYPE user_role AS ENUM ('passenger', 'driver', 'both');

CREATE TYPE fuel_type AS ENUM ('petrol', 'diesel', 'hybrid', 'electric');

CREATE TYPE campus AS ENUM ('clayton', 'caulfield', 'peninsula', 'parkville', 'city');

CREATE TYPE ride_status AS ENUM ('open', 'full', 'in_progress', 'completed', 'cancelled');

CREATE TYPE booking_status AS ENUM ('confirmed', 'cancelled', 'completed');

CREATE TYPE pet_stage AS ENUM ('egg', 'hatched', 'juvenile', 'adult', 'legendary');

CREATE TYPE accessory_category AS ENUM ('headwear', 'eyewear', 'clothing', 'background', 'held_item');

CREATE TYPE travel_mode AS ENUM ('drive', 'transit');

-- user table 

CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_id      TEXT UNIQUE NOT NULL,
    email         TEXT NOT NULL,
    phone         TEXT NOT NULL,
    full_name     TEXT NOT NULL,
    role          user_role NOT NULL DEFAULT 'passenger',
    is_concession BOOLEAN NOT NULL DEFAULT false,
    green_points  INTEGER NOT NULL DEFAULT 0,
    joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT users_green_points_non_negative CHECK (green_points >= 0)
);

-- fuel_consumption (L/100km) is copied from vehicle_reference at registration
-- time, not looked up later, so updates to the reference data cannot
-- retroactively change the emissions already reported for a completed ride.

CREATE TABLE vehicles (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id         UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE, -- deletes vehicle when user is deleted
    make             TEXT NOT NULL,
    model            TEXT NOT NULL,
    year             INTEGER NOT NULL,
    fuel_type        fuel_type NOT NULL,
    fuel_consumption DOUBLE PRECISION NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT vehicles_year_plausible CHECK (year BETWEEN 1950 AND 2100),
    CONSTRAINT vehicles_consumption_positive CHECK (fuel_consumption > 0)
);

CREATE INDEX idx_vehicles_owner ON vehicles (owner_id);

-- co2_saved and points_earned stay NULL until the ride completes. A non-null
-- value is the marker that rewards were already awarded, which is what makes
-- the payout idempotent.

CREATE TABLE rides (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id       UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT, -- blocks the delete
    vehicle_id      UUID NOT NULL REFERENCES vehicles (id) ON DELETE RESTRICT,
    origin          campus NOT NULL,
    destination     campus NOT NULL,
    departure_at    TIMESTAMPTZ NOT NULL,
    total_seats     INTEGER NOT NULL,
    available_seats INTEGER NOT NULL,
    distance_km     DOUBLE PRECISION NOT NULL,
    status          ride_status NOT NULL DEFAULT 'open',
    co2_saved       DOUBLE PRECISION,
    points_earned   INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT rides_distinct_campuses CHECK (origin <> destination), -- <> is not equal
    CONSTRAINT rides_total_seats_positive CHECK (total_seats > 0),
    CONSTRAINT rides_available_seats_in_range
        CHECK (available_seats >= 0 AND available_seats <= total_seats),
    CONSTRAINT rides_distance_positive CHECK (distance_km > 0)
);

-- Serves GET /rides/search, which filters on route then narrows by date.
CREATE INDEX idx_rides_search ON rides (origin, destination, departure_at);

CREATE INDEX idx_rides_driver ON rides (driver_id);

-- The UNIQUE constraint is a correctness guarantee, not an optimisation: it
-- makes double-booking impossible at the database level even if two requests
-- race past the service-layer check.

CREATE TABLE bookings (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_id      UUID NOT NULL REFERENCES rides (id) ON DELETE CASCADE,
    passenger_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    status       booking_status NOT NULL DEFAULT 'confirmed',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT bookings_one_per_passenger_per_ride UNIQUE (ride_id, passenger_id)
);

CREATE INDEX idx_bookings_passenger ON bookings (passenger_id);

-- One row per user, created on first sync. total_co2_saved is cumulative and
-- drives pet_stage progression (egg 0kg, hatched 15, juvenile 60, adult 200,
-- legendary 800). These thresholds supersede the proposal's; see docs/changes.md
-- section 2. total_co2_saved accumulates CO2 avoided, not the ride's emissions.

CREATE TABLE rewards (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
    pet_stage       pet_stage NOT NULL DEFAULT 'egg',
    total_co2_saved DOUBLE PRECISION NOT NULL DEFAULT 0,
    milestone       INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT rewards_co2_non_negative CHECK (total_co2_saved >= 0)
);

-- Static shop catalogue, seeded rather than user-generated. required_stage
-- gates items behind pet progression: GET /pet/accessories filters on it.

CREATE TABLE accessories (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name           TEXT NOT NULL,
    description    TEXT,
    category       accessory_category NOT NULL,
    cost           INTEGER NOT NULL,
    required_stage pet_stage NOT NULL DEFAULT 'egg',
    image_url      TEXT NOT NULL,

    CONSTRAINT accessories_cost_non_negative CHECK (cost >= 0)
);

-- Join table recording which accessories a user owns and which are equipped.
-- Ownership is permanent; equipped is a toggle.

CREATE TABLE pet_accessories (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    accessory_id UUID NOT NULL REFERENCES accessories (id) ON DELETE CASCADE,
    equipped     BOOLEAN NOT NULL DEFAULT false,
    purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pet_accessories_owned_once UNIQUE (user_id, accessory_id)
);

CREATE INDEX idx_pet_accessories_user ON pet_accessories (user_id);

-- Google Maps Routes API cache. Drive rows are cached permanently; transit rows
-- are refreshed hourly against cached_at.
--
-- legs holds the per-step breakdown of a transit route as
--   [{"mode": "train", "distance_km": 12.4, "duration_min": 18, "line": "Cranbourne"}]
-- and is NULL for drive rows. Transit emissions are the sum over legs, so a
-- transit route cannot be costed without it.

CREATE TABLE campus_routes (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    origin        campus NOT NULL,
    destination   campus NOT NULL,
    travel_mode   travel_mode NOT NULL,
    distance_km   DOUBLE PRECISION,
    duration_min  INTEGER NOT NULL,
    route_summary TEXT,
    legs          JSONB,
    cached_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT campus_routes_distinct_campuses CHECK (origin <> destination),
    CONSTRAINT campus_routes_duration_positive CHECK (duration_min > 0),
    CONSTRAINT campus_routes_one_per_pair_and_mode
        UNIQUE (origin, destination, travel_mode)
);

-- Built by backend/scripts/prepare_vehicle_reference.py from Natural Resources
-- Canada open data, filtered to makes sold in Australia, with fuel labels
-- normalised to the fuel_type enum (proposal 4.4).
-- Method and citations: docs/vehicle-reference-dataset.md
--
-- avg_consumption units depend on fuel_type: L/100 km for petrol, diesel and
-- hybrid, kWh/100 km for electric. Read it without branching on fuel_type and
-- an EV's running cost comes out roughly ten times too low.
--
-- engine_size is part of the unique key because the same nameplate ships with
-- different displacements in the same year (a 2020 Corolla is sold as both a
-- 1.8 and a 2.0, with different consumption). NULLS NOT DISTINCT is required
-- because engine_size is NULL for every electric row, and Postgres otherwise
-- treats each NULL as unique and would allow duplicate EVs.

CREATE TABLE vehicle_reference (
    id              INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    make            TEXT NOT NULL,
    model           TEXT NOT NULL,
    year            INTEGER NOT NULL,
    fuel_type       fuel_type NOT NULL,
    engine_size     DOUBLE PRECISION,
    avg_consumption DOUBLE PRECISION NOT NULL,

    CONSTRAINT vehicle_reference_unique_vehicle
        UNIQUE NULLS NOT DISTINCT (make, model, year, fuel_type, engine_size),
    CONSTRAINT vehicle_reference_consumption_positive CHECK (avg_consumption > 0)
);

CREATE INDEX idx_vehicle_reference_lookup ON vehicle_reference (make, model, year);

-- Written once daily by the Servo Saver job. Reads take the most recent row per
-- fuel_type; the API is never called from a request path.

CREATE TABLE fuel_prices (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fuel_type       fuel_type NOT NULL,
    price_per_litre DOUBLE PRECISION NOT NULL,
    fetched_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fuel_prices_positive CHECK (price_per_litre > 0)
);

-- DESC on fetched_at lets "latest price for this fuel type" be an index scan
-- rather than a full scan and sort.
CREATE INDEX idx_fuel_prices_latest ON fuel_prices (fuel_type, fetched_at DESC);

-- Supabase exposes every table over PostgREST, and the anon key is public. RLS
-- is enabled with no policies attached, which denies all access through that
-- key. The backend connects with the service_role key, which bypasses RLS, so
-- every authorisation decision stays in the FastAPI service layer where it can
-- be unit tested.

-- prevents people with anon key to access/alter things in the db

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE rides ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE accessories ENABLE ROW LEVEL SECURITY;
ALTER TABLE pet_accessories ENABLE ROW LEVEL SECURITY;
ALTER TABLE campus_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_reference ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel_prices ENABLE ROW LEVEL SECURITY;
