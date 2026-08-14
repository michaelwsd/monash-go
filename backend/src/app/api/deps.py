from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import Settings, get_settings
from app.core.security import verify_clerk_token
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


def get_current_user_id(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> str:
    """
    parses the token from the header, verify the token and return the userid
    """
    if credentials is None:
        raise InvalidCredentialsError("missing or malformed authorization header")
    return verify_clerk_token(credentials.credentials)


# declares the user type in 'user: CurrentUser' in a route
# route never runs if the token is invalid
CurrentUser = Annotated[str, Depends(get_current_user_id)]
