from uuid import UUID

from pydantic import BaseModel

from app.schemas.enums import PetStage


class Rewards(BaseModel):
    """A rewards row: the pet's progress, which points cannot undo.

    total_co2_saved is cumulative and only ever climbs. green_points lives on
    the users row and is spent in the shop, so the two must not be conflated -
    buying a hat must not demote the pet.
    """

    id: UUID
    user_id: UUID
    pet_stage: PetStage
    total_co2_saved: float
    milestone: int


class RewardsSummary(BaseModel):
    """GET /rewards/me. REQ-013's impact dashboard, in one response.

    next_stage and co2_to_next are None at 'legendary', which is the end of the
    progression - the UI shows the bar full rather than a target nobody can
    reach.
    """

    green_points: int
    total_co2_saved: float
    pet_stage: PetStage
    next_stage: PetStage | None
    co2_to_next: float | None
    # progress through the current stage, 0-100
    stage_progress: float
    completed_trips: int
