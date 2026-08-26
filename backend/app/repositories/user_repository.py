"""Every users-table query"""

from typing import Any

from postgrest.exceptions import APIError

from app.exceptions.errors import ExternalServiceError
from app.schemas.user import User
from supabase import Client

TABLE = "users"


def _execute(request: Any) -> Any:
    try:
        return request.execute()
    except APIError as exc:
        raise ExternalServiceError(
            "User data is unavailable. Check the backend Supabase URL, API key, and system clock."
        ) from exc


# get user data
def get_by_clerk_id(db: Client, clerk_id: str) -> User | None:
    res = _execute(db.table(TABLE).select("*").eq("clerk_id", clerk_id).limit(1))
    return User.model_validate(res.data[0]) if res.data else None


def create_if_absent(
    # * marks everything after as keyword only, i.e. must be passed by name (not positional)
    db: Client,
    *,
    clerk_id: str,
    email: str,
    full_name: str,
) -> User | None:
    """
    insert or do nothing if the clerk_id already exists
    """
    payload = {
        "clerk_id": clerk_id,
        "email": email,
        "full_name": full_name,
        "phone": "",
    }

    res = _execute(db.table(TABLE).upsert(payload, on_conflict="clerk_id", ignore_duplicates=True))

    return User.model_validate(res.data[0]) if res.data else None


def update_clerk_fields(db: Client, *, clerk_id: str, email: str, full_name: str) -> User:
    """update email and full name"""
    res = _execute(
        db.table(TABLE).update({"email": email, "full_name": full_name}).eq("clerk_id", clerk_id)
    )

    return User.model_validate(res.data[0])


def update_profile(db: Client, *, clerk_id: str, fields: dict[str, Any]) -> User | None:
    """update the columns in fields, none if no rows matched"""
    res = _execute(db.table(TABLE).update(fields).eq("clerk_id", clerk_id))
    return User.model_validate(res.data[0]) if res.data else None
