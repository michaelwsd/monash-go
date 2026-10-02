from uuid import UUID

import httpx

from app.core import costs, emissions
from app.core.constants import ESTIMATE_RIDERS, FLEET_AVG_CONSUMPTION, FLEET_AVG_FUEL_TYPE
from app.exceptions.errors import InvalidInputError, NotFoundError, UpstreamServiceError
from app.repositories import (
    booking_repository,
    ride_repository,
    user_repository,
    vehicle_repository,
)
from app.schemas.compare import Comparison, ModeComparison, RouteEstimate
from app.schemas.enums import Campus, FuelType
from app.schemas.route import CampusRoute
from app.services import fuel_service, route_service
from supabase import Client


def compare(db: Client, http: httpx.Client, *, clerk_id: str, ride_id: UUID) -> Comparison:
    viewer = user_repository.get_by_clerk_id(db, clerk_id)  # needed to check concession
    ride = ride_repository.get_ride(db, ride_id)
    if not viewer:
        raise NotFoundError("user not found")

    if not ride:
        raise NotFoundError("ride not found")

    vehicle = vehicle_repository.get_by_id(db, ride.vehicle_id)
    if not vehicle:
        raise NotFoundError("vehicle not found")

    # get the routes for drive and transit
    drive = route_service.get_route(
        db, http, origin=ride.origin, destination=ride.destination, travel_mode="drive"
    )
    transit = route_service.get_route(
        db, http, origin=ride.origin, destination=ride.destination, travel_mode="transit"
    )

    # count how many people
    # Whose view is this? A passenger deciding whether to book sees the split
    # as it would be with them in it. A passenger who has booked, and the
    # driver, see the ride as it is. The driver never holds a booking, so
    # without this branch they would be handed a phantom extra rider - and a
    # different figure from the one their own passenger sees.
    confirmed = booking_repository.count_confirmed(db, ride_id=ride_id)
    if viewer.id == ride.driver_id:
        riders = max(confirmed, 1)
    else:
        mine = booking_repository.get_confirmed(db, ride_id=ride_id, passenger_id=viewer.id)
        riders = confirmed + (0 if mine else 1)

    fuel_price = (
        None
        if vehicle.fuel_type == "electric"
        else fuel_service.latest_price(db, fuel_type=vehicle.fuel_type)
    )

    modes = _modes(
        drive=drive,
        transit=transit,
        distance_km=ride.distance_km,
        fuel_consumption=vehicle.fuel_consumption,
        fuel_type=vehicle.fuel_type,
        fuel_price=fuel_price,
        riders=riders,
        is_concession=viewer.is_concession,
    )

    return Comparison(
        ride_id=ride.id,
        riders=riders,
        is_concession=viewer.is_concession,
        fuel_price=fuel_price,
        modes=modes,
        transit_legs=transit.legs,
    )


def estimate(
    db: Client, http: httpx.Client, *, clerk_id: str, origin: Campus, destination: Campus
) -> RouteEstimate:
    """The same three-way comparison for a campus pair nobody has posted a ride on.

    There is no driver's car to read, so it prices the fleet-average petrol car
    with ESTIMATE_RIDERS passengers. A rough figure, labelled as one on screen,
    so a search that finds nothing still answers "what would this trip cost?".
    """
    if origin == destination:
        raise InvalidInputError("origin and destination must be different campuses")

    viewer = user_repository.get_by_clerk_id(db, clerk_id)  # needed to check concession
    if not viewer:
        raise NotFoundError("user not found")

    drive = route_service.get_route(
        db, http, origin=origin, destination=destination, travel_mode="drive"
    )
    transit = route_service.get_route(
        db, http, origin=origin, destination=destination, travel_mode="transit"
    )
    # nullable on the row because a transit total is optional; a drive row
    # always has one, so a missing figure means the cache is broken
    if drive.distance_km is None:
        raise UpstreamServiceError(f"no driving distance for {origin} -> {destination}")

    fuel_price = fuel_service.latest_price(db, fuel_type=FLEET_AVG_FUEL_TYPE)

    return RouteEstimate(
        origin=origin,
        destination=destination,
        distance_km=drive.distance_km,
        fuel_consumption=FLEET_AVG_CONSUMPTION,
        drive_summary=drive.route_summary,
        transit_summary=transit.route_summary,
        riders=ESTIMATE_RIDERS,
        is_concession=viewer.is_concession,
        fuel_price=fuel_price,
        modes=_modes(
            drive=drive,
            transit=transit,
            distance_km=drive.distance_km,
            fuel_consumption=FLEET_AVG_CONSUMPTION,
            fuel_type=FLEET_AVG_FUEL_TYPE,
            fuel_price=fuel_price,
            riders=ESTIMATE_RIDERS,
            is_concession=viewer.is_concession,
        ),
        transit_legs=transit.legs,
    )


def _modes(
    *,
    drive: CampusRoute,
    transit: CampusRoute,
    distance_km: float,
    fuel_consumption: float,
    fuel_type: FuelType,
    fuel_price: float | None,
    riders: int,
    is_concession: bool,
) -> list[ModeComparison]:
    """carpool, transit and private, in that order. Shared by both entry points
    so a ride and an estimate can never be priced by different rules."""
    return [
        ModeComparison(
            mode="carpool",
            duration_min=drive.duration_min,
            cost=costs.cost_rideshare(distance_km, fuel_consumption, fuel_type, riders, fuel_price),
            co2_kg=emissions.co2_rideshare(distance_km, fuel_consumption, fuel_type, riders + 1),
        ),
        ModeComparison(
            mode="transit",
            duration_min=transit.duration_min,
            cost=costs.cost_transit(is_concession),
            co2_kg=emissions.co2_transit(
                [emissions.TransitLeg(leg.mode, leg.distance_km) for leg in transit.legs or []]
            ),
        ),
        ModeComparison(
            mode="private",
            duration_min=drive.duration_min,
            cost=costs.cost_solo(distance_km, fuel_consumption, fuel_type, fuel_price),
            co2_kg=emissions.co2_solo(distance_km, fuel_consumption, fuel_type),
        ),
    ]
