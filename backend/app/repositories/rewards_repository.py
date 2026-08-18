from uuid import UUID

from supabase import Client

TABLE = "rewards"


def create_if_absent(db: Client, *, user_id: UUID) -> None:
    """one reward row per user"""
    db.table(TABLE).upsert(
        # ignore duplicates means when conflict do nothing
        {"user_id": str(user_id)},
        on_conflict="user_id",
        ignore_duplicates=True,
    ).execute()
