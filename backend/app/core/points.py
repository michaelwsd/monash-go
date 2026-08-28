"""green points and pet progression"""

from math import floor

from app.core.constants import PET_STAGE_THRESHOLDS
from app.schemas.enums import PetStage


def points_earned(co2_avoided_kg: float) -> int:
    """green points for one completed ride: floor(kg x 100)"""
    return max(0, floor(co2_avoided_kg * 100))


def pet_stage_for(total_co2_avoided_kg: float) -> PetStage:
    """the stage a user's cumulative avoided CO2 has reached"""
    for threshold, stage in PET_STAGE_THRESHOLDS:
        if total_co2_avoided_kg >= threshold:
            return stage
    return "egg"
