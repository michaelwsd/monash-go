"""The daily fuel price job.

Fetches every Victorian station from Servo Saver, takes the statewide median
for petrol and diesel, and appends a row per fuel type to fuel_prices. The
compare service reads the newest row and never calls the API itself: Servo
Saver allows ten requests a minute, and a price that moved mid-session would
let two identical comparisons disagree.

    uv run python -m scripts.fetch_fuel_prices

Runs from .github/workflows/fuel-prices.yml every morning. Exits non-zero on
failure so the run shows red, and writes nothing in that case - yesterday's rows
stay the newest for every fuel type, so a failed morning costs nothing but
freshness.
"""

import logging
import sys

from app.clients.servo_saver import get_servo_client
from app.db.client import get_supabase
from app.exceptions.errors import UpstreamServiceError
from app.services import fuel_service

log = logging.getLogger(__name__)


def main() -> None:
    # The script decides where logs go, not the service. On GitHub Actions
    # that is stdout, which is what you read when a morning's run fails.
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        stream=sys.stdout,
    )

    try:
        prices = fuel_service.fetch_and_store(get_supabase(), get_servo_client())
    except UpstreamServiceError:
        # exception(), not error(): the httpx cause is chained under the
        # domain error, and this is the only place it will ever be printed
        log.exception("fuel price fetch failed; nothing written")
        raise SystemExit(1) from None

    print("\nStored today's prices")
    for fuel_type, price in prices.items():
        print(f"  {fuel_type:<8} ${price:.3f}/L")


if __name__ == "__main__":
    main()
