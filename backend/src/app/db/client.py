"""The Supabase client.

One client per process, not one per request. The client owns an HTTP connection
pool; building one per request exhausts connections under load and pays for a
fresh TLS handshake on every call. @lru_cache on a zero-argument function is the
simplest correct singleton: the first call builds it, every later call returns
the same object.

This uses the service role key, which bypasses RLS. That is deliberate for a
trusted backend that does its own authorisation, and it is why this key must
never reach the frontend (the frontend gets supabase_anon_key).
"""

from functools import lru_cache

from app.core.config import get_settings
from supabase import Client, create_client


@lru_cache
def get_supabase() -> Client:
    settings = get_settings()
    return create_client(
        settings.supabase_url,
        settings.supabase_key.get_secret_value(),
    )
