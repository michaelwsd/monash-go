-- Keep-alive probe target.
--
-- Supabase pauses a free project after 7 days without DATABASE activity.
-- Pinging /auth/v1/health does not count: GoTrue answers that from memory and
-- never opens a connection to Postgres, so the old keep-alive workflow went
-- green every run while the project drifted into a pause anyway.
--
-- This table exists purely so the workflow has something it can SELECT through
-- PostgREST, which forces a real query onto Postgres. It holds one row and no
-- application data, so granting the public anon key read access exposes
-- nothing. Every other table keeps RLS-with-no-policies (see 0001_init.sql).
--
-- Returning an actual row matters: an RLS-blocked SELECT answers 200 with [],
-- which is indistinguishable from a broken probe. Because this row IS
-- readable, the workflow can assert it came back and fail loudly otherwise.

CREATE TABLE keepalive (
    id        SMALLINT PRIMARY KEY DEFAULT 1,
    pinged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT keepalive_single_row CHECK (id = 1)
);

INSERT INTO keepalive (id) VALUES (1);

ALTER TABLE keepalive ENABLE ROW LEVEL SECURITY;

CREATE POLICY keepalive_anon_read ON keepalive
    FOR SELECT TO anon
    USING (true);
