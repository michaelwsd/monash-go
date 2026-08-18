from app.exceptions.errors import DomainError
from app.repositories import rewards_repository, user_repository
from app.schemas.user import User
from supabase import Client


def sync(db: Client, *, clerk_id: str, email: str, full_name: str) -> User:
    """
    make sure a user row exists for this user and return this user
    called on every page load
    """
    existing = user_repository.get_by_clerk_id(db, clerk_id)

    if not existing:
        created = user_repository.create_if_absent(
            db, clerk_id=clerk_id, email=email, full_name=full_name
        )

        if not created:
            # another request created in between
            created = user_repository.get_by_clerk_id(db, clerk_id)
            if not created:
                raise DomainError("user sync failed")

        rewards_repository.create_if_absent(db, user_id=created.id)
        return created

    # update fields
    if existing.email != email or existing.full_name != full_name:
        return user_repository.update_clerk_fields(
            db, clerk_id=clerk_id, email=email, full_name=full_name
        )

    return existing
