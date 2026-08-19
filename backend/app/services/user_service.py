from app.exceptions.errors import DomainError, NotFoundError, PermissionDeniedError
from app.repositories import rewards_repository, user_repository
from app.schemas.user import User, UserUpdate
from supabase import Client

MONASH_EMAIL_DOMAINS = ("@student.monash.edu", "@monash.edu")


def sync(db: Client, *, clerk_id: str, email: str, full_name: str) -> User:
    """
    make sure a user row exists for this user and return this user
    called on every page load
    """
    if not email.lower().endswith(MONASH_EMAIL_DOMAINS):
        raise PermissionDeniedError("a Monash email address is required")

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


def update_profile(db: Client, *, clerk_id: str, changes: UserUpdate) -> User:
    """
    apply a partial profile update
    """
    # turns into a dict, only include the fields that are actually sent
    fields = changes.model_dump(exclude_unset=True)

    if "phone" in fields and fields["phone"] is None:
        # phone cannot be removed
        raise DomainError("phone cannot be cleared")

    if not fields:
        existing = user_repository.get_by_clerk_id(db, clerk_id)
        if not existing:
            raise NotFoundError("user not found")
        return existing

    updated = user_repository.update_profile(db, clerk_id=clerk_id, fields=fields)
    if not updated:
        raise NotFoundError("user not found")
    return updated
