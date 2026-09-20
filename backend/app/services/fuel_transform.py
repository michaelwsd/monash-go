from collections import defaultdict
from statistics import median
from typing import Any

from app.core.constants import SERVO_FUEL_CODES
from app.exceptions.errors import UpstreamServiceError
from app.schemas.enums import FuelType


def to_prices(payload: dict[str, Any]) -> dict[FuelType, float]:
    cents: dict[str, list[float]] = defaultdict(list)

    for station in payload["fuelPriceDetails"]:
        for entry in station["fuelPrices"]:
            code, available, price = entry["fuelType"], entry["isAvailable"], entry["price"]

            # filter
            if code not in ["U91", "DSL"] or available is False or price is None:
                continue

            cents[code].append(price)

    if "U91" not in cents:
        raise UpstreamServiceError("U91 missing, api error")

    res: dict[FuelType, float] = {}

    for fuel_type, code in SERVO_FUEL_CODES.items():
        if cents[code]:
            res[fuel_type] = median(cents[code]) / 100

    return res
