from fastapi import APIRouter

from app.api.deps import CurrentUser, SupabaseDep
from app.schemas.rewards import RewardsSummary
from app.services import rewards_service

router = APIRouter(prefix="/rewards", tags=["rewards"])


@router.get("/me", response_model=RewardsSummary)
def my_rewards(clerk_id: CurrentUser, db: SupabaseDep) -> RewardsSummary:
    return rewards_service.summary(db, clerk_id=clerk_id)
