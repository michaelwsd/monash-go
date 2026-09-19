import logging

import httpx

from app.clients import servo_saver
from app.exceptions.errors import NotFoundError
from app.repositories import fuel_repository
from app.schemas.enums import FuelType
from app.services.fuel_transform import to_prices
from supabase import Client

log = logging.getLogger(__name__)


def fetch_and_store(db: Client, http: httpx.Client) -> dict[FuelType, float]:
    prices = to_prices(servo_saver.fetch_prices(http))

    for fuel_type, price in prices.items():
        fuel_repository.insert(db, fuel_type=fuel_type, price_per_litre=price)
    log.info("stored fuel prices %s", prices)
    return prices


def latest_price(db: Client, *, fuel_type: FuelType) -> float:
    row = fuel_repository.latest(db, fuel_type=fuel_type)
    if row is None:
        raise NotFoundError(f"no {fuel_type} price on record")
    return row.price_per_litre
