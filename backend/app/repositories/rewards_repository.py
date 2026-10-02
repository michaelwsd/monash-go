from uuid import UUID

from pydantic import TypeAdapter

from app.schemas.enums import PetStage
from app.schemas.rewards import Rewards
from supabase import Client

TABLE = "rewards"

# A Postgres function declared RETURNS TABLE answers with a list of rows even
# when there is only ever one; validating the list is what makes the untyped
# PostgREST JSON type-check. Same reasoning as booking_repository.
COMPLETION_ROWS = TypeAdapter(list[dict[str, object]])


def create_if_absent(db: Client, *, user_id: UUID) -> None:
    """one reward row per user"""
    db.table(TABLE).upsert(
        # ignore duplicates means when conflict do nothing
        {"user_id": str(user_id)},
        on_conflict="user_id",
        ignore_duplicates=True,
    ).execute()


def get(db: Client, *, user_id: UUID) -> Rewards | None:
    res = db.table(TABLE).select("*").eq("user_id", str(user_id)).limit(1).execute()
    return Rewards.model_validate(res.data[0]) if res.data else None


def set_stage(db: Client, *, user_id: UUID, pet_stage: PetStage) -> None:
    """Write a stage the service worked out from core/points.pet_stage_for.

    The thresholds stay in core/constants.py rather than being duplicated in
    SQL, so there is one place to change them.
    """
    db.table(TABLE).update({"pet_stage": pet_stage}).eq("user_id", str(user_id)).execute()


def complete_ride(
    db: Client, *, ride_id: UUID, driver_id: UUID, co2_saved: float, points: int
) -> tuple[str, int]:
    """Mark a ride completed and pay everyone on it, atomically.

    Returns the result word and how many passengers were credited. The word is
    translated into a domain error by the service; repositories do not raise.
    """
    res = db.rpc(
        "complete_ride",
        {
            "p_ride_id": str(ride_id),
            "p_driver_id": str(driver_id),
            "p_co2_saved": co2_saved,
            "p_points": points,
        },
    ).execute()
    row = COMPLETION_ROWS.validate_python(res.data)[0]
    return str(row["result"]), int(row["credited"])  # type: ignore[call-overload]
