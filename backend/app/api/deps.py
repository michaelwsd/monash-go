"""What a route can ask for by name.

Each name pairs a type with the function that produces it. A route declares
`db: SupabaseDep` and FastAPI calls get_supabase before the body runs, so no
route builds its own client or parses its own Authorization header.

They live in api/ because Depends is an HTTP concern. get_settings and
get_supabase know nothing about requests; this is the thin adapter that makes
them requestable, which keeps FastAPI out of core/ and db/.

Auth dependencies raise before the body runs, so an invalid token is a 401 the
route never sees. All of this is real at runtime: tests swap implementations
through app.dependency_overrides.
"""

from typing import Annotated

import httpx
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.clients.maps import get_maps_client
from app.core.config import Settings, get_settings
from app.core.security import ClerkClaims, verify_clerk_token
from app.db.client import get_supabase
from app.exceptions.errors import InvalidCredentialsError
from supabase import Client

# Depends just wraps the function
# Annotated[X, note] means "the type is X, with a note attached.
# says: the thing is type X, and to get it you call 'note'
SettingsDep = Annotated[Settings, Depends(get_settings)]

SupabaseDep = Annotated[Client, Depends(get_supabase)]

# parses 'Authorization: Bearer <token>', returns an object whose .credentials is the token
bearer_scheme = HTTPBearer(auto_error=False)


# first verify the token and extract the fields, then pass fields to get_current_user_id
def get_current_claims(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> ClerkClaims:
    """The verified claims of the caller, or a 401."""
    if credentials is None:
        raise InvalidCredentialsError("missing or malformed authorization header")
    return verify_clerk_token(credentials.credentials)


def get_current_user_clerk_id(
    claims: Annotated[ClerkClaims, Depends(get_current_claims)],
) -> str:
    return claims.clerk_id


# declares the user type in 'user: CurrentUser' in a route
# route never runs if the token is invalid (function always called before route)
CurrentUser = Annotated[str, Depends(get_current_user_clerk_id)]

CurrentClaims = Annotated[ClerkClaims, Depends(get_current_claims)]

MapsDep = Annotated[httpx.Client, Depends(get_maps_client)]
