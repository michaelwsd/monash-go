from uuid import UUID

import httpx

from app.core import costs, emissions
from app.exceptions.errors import NotFoundError
from app.repositories import (
    booking_repository,
    ride_repository,
    user_repository,
    vehicle_repository,
)
from app.schemas.compare import Comparison, ModeComparison
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
    confirmed = booking_repository.count_confirmed(db, ride_id=ride_id)
    mine = booking_repository.get_confirmed(db, ride_id=ride_id, passenger_id=viewer.id)
    riders = confirmed + (0 if mine else 1)

    fuel_price = (
        None
        if vehicle.fuel_type == "electric"
        else fuel_service.latest_price(db, fuel_type=vehicle.fuel_type)
    )

    # put all modes together
    modes = [
        ModeComparison(
            mode="carpool",
            duration_min=drive.duration_min,
            cost=costs.cost_rideshare(
                ride.distance_km, vehicle.fuel_consumption, vehicle.fuel_type, riders, fuel_price
            ),
            co2_kg=emissions.co2_rideshare(
                ride.distance_km, vehicle.fuel_consumption, vehicle.fuel_type, riders + 1
            ),
        ),
        ModeComparison(
            mode="transit",
            duration_min=transit.duration_min,
            cost=costs.cost_transit(viewer.is_concession),
            co2_kg=emissions.co2_transit(
                [emissions.TransitLeg(leg.mode, leg.distance_km) for leg in transit.legs or []]
            ),
        ),
        ModeComparison(
            mode="private",
            duration_min=drive.duration_min,
            cost=costs.cost_solo(
                ride.distance_km, vehicle.fuel_consumption, vehicle.fuel_type, fuel_price
            ),
            co2_kg=emissions.co2_solo(
                ride.distance_km, vehicle.fuel_consumption, vehicle.fuel_type
            ),
        ),
    ]

    return Comparison(
        ride_id=ride.id,
        riders=riders,
        is_concession=viewer.is_concession,
        fuel_price=fuel_price,
        modes=modes,
        transit_legs=transit.legs,
    )
