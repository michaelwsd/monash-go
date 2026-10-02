"""Completing a ride, and what that earns.

Two calculations meet here and must not be confused (CLAUDE.md):

  - the comparison dashboard asks "what does THIS trip cost in each mode?"
    and uses the driver's actual vehicle. That is compare_service.
  - rewards ask "what did carpooling avoid?" against a fleet-average
    counterfactual, once, on the transition to 'completed'. That is this file.

Nothing here computes anything. co2_avoided and points_earned are Sprint 2's
pure functions, tested against the worked examples in docs/changes.md; the
atomic payout is supabase/migrations/0004_complete_ride.sql. This orchestrates.
"""

import logging
from uuid import UUID

from app.core.emissions import co2_avoided
from app.core.points import pet_stage_for, points_earned
from app.exceptions.errors import (
    DomainError,
    InvalidInputError,
    NotFoundError,
    PermissionDeniedError,
)
from app.repositories import (
    booking_repository,
    rewards_repository,
    ride_repository,
    user_repository,
    vehicle_repository,
)
from app.schemas.enums import PetStage
from app.schemas.rewards import RewardsSummary
from app.schemas.ride import RideCompletion
from supabase import Client

log = logging.getLogger(__name__)

COMPLETION_ERRORS: dict[str, type[DomainError]] = {
    "ride_not_found": NotFoundError,
    "not_your_ride": PermissionDeniedError,
    "not_departed": InvalidInputError,
}

# Re-exported so the stage rule has one name in tests and in the service.
stage_for = pet_stage_for


def complete_ride(db: Client, *, clerk_id: str, ride_id: UUID) -> RideCompletion:
    """Mark a ride finished and credit everyone who was on it.

    Idempotent: a second call returns the ride's existing figures with
    `already_completed` set, rather than paying again or failing. A driver who
    taps twice has done nothing wrong.
    """
    driver = user_repository.get_by_clerk_id(db, clerk_id)
    if not driver:
        raise NotFoundError("user not found")

    ride = ride_repository.get_ride(db, ride_id)
    if not ride:
        raise NotFoundError("ride not found")

    # Checked here as well as in SQL so the caller gets a specific error rather
    # than a result word; the SQL check is the one that is race-proof.
    if ride.driver_id != driver.id:
        raise PermissionDeniedError("only the driver can complete this ride")

    if ride.co2_saved is not None:
        return RideCompletion(
            ride_id=ride.id,
            co2_saved=ride.co2_saved,
            points_earned=ride.points_earned or 0,
            passengers=0,
            already_completed=True,
        )

    vehicle = vehicle_repository.get_by_id(db, ride.vehicle_id)
    if not vehicle:
        raise NotFoundError("vehicle not found")

    passengers = booking_repository.list_confirmed_for_ride(db, ride_id=ride.id)
    avoided = co2_avoided(
        ride.distance_km, vehicle.fuel_consumption, vehicle.fuel_type, len(passengers)
    )
    points = points_earned(avoided)

    result, credited = rewards_repository.complete_ride(
        db, ride_id=ride.id, driver_id=driver.id, co2_saved=avoided, points=points
    )

    if result == "already_completed":
        # Lost the race to another tap. The figures just computed are not the
        # ones that were paid: the winning call moved every booking to
        # 'completed', so recomputing now sees zero confirmed passengers and
        # would report a 0 kg ride. Re-read what was actually stored.
        return _stored_completion(db, ride_id=ride.id)

    if result != "completed":
        raise COMPLETION_ERRORS.get(result, DomainError)(f"could not complete: {result}")

    # Stages are recomputed from each new total, so the thresholds stay in
    # core/constants.py rather than being duplicated in SQL.
    for user_id in [driver.id, *[booking.passenger_id for booking in passengers]]:
        _refresh_stage(db, user_id=user_id)

    log.info(
        "ride %s completed: %.3f kg, %d points to %d people", ride.id, avoided, points, credited + 1
    )
    return RideCompletion(
        ride_id=ride.id,
        co2_saved=avoided,
        points_earned=points,
        passengers=credited,
        already_completed=False,
    )


def _stored_completion(db: Client, *, ride_id: UUID) -> RideCompletion:
    """What a ride was actually paid, read back from the row."""
    ride = ride_repository.get_ride(db, ride_id)
    if ride is None:
        raise NotFoundError("ride not found")
    return RideCompletion(
        ride_id=ride.id,
        co2_saved=ride.co2_saved or 0.0,
        points_earned=ride.points_earned or 0,
        passengers=0,
        already_completed=True,
    )


def _refresh_stage(db: Client, *, user_id: UUID) -> PetStage | None:
    rewards = rewards_repository.get(db, user_id=user_id)
    if rewards is None:
        return None
    stage = pet_stage_for(rewards.total_co2_saved)
    if stage != rewards.pet_stage:
        rewards_repository.set_stage(db, user_id=user_id, pet_stage=stage)
    return stage


def summary(db: Client, *, clerk_id: str) -> RewardsSummary:
    """REQ-013's impact dashboard: what this user's completed trips add up to."""
    user = user_repository.get_by_clerk_id(db, clerk_id)
    if not user:
        raise NotFoundError("user not found")

    rewards = rewards_repository.get(db, user_id=user.id)
    total = rewards.total_co2_saved if rewards else 0.0
    stage = pet_stage_for(total)

    trips = ride_repository.count_completed_for_user(
        db, user_id=user.id
    ) + booking_repository.count_completed_for_passenger(db, passenger_id=user.id)

    floor_kg, next_stage, ceiling = _stage_band(total)
    return RewardsSummary(
        green_points=user.green_points,
        total_co2_saved=total,
        pet_stage=stage,
        next_stage=next_stage,
        co2_to_next=None if ceiling is None else max(0.0, ceiling - total),
        stage_progress=(
            100.0
            if ceiling is None
            else min(100.0, (total - floor_kg) / (ceiling - floor_kg) * 100)
        ),
        completed_trips=trips,
    )


def _stage_band(total: float) -> tuple[float, PetStage | None, float | None]:
    """Where this total sits: the current stage's floor, and the next target.

    At 'legendary' there is nothing above, so the next stage is None and the UI
    shows a full bar rather than a target nobody can reach.
    """
    from app.core.constants import PET_STAGE_THRESHOLDS

    ascending = sorted(PET_STAGE_THRESHOLDS)  # (0, egg) ... (800, legendary)
    floor_kg = 0.0
    for index, (threshold, _stage) in enumerate(ascending):
        if total >= threshold:
            floor_kg = threshold
            continue
        return floor_kg, ascending[index][1], threshold
    return floor_kg, None, None
