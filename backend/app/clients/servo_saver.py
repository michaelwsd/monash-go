import uuid
from functools import lru_cache
from typing import Any

import httpx

from app.core.config import get_settings
from app.exceptions.errors import UpstreamServiceError

URL = "https://api.fuel.service.vic.gov.au/open-data/v1/fuel/prices"

REQUEST_TIMEOUT_SECONDS = 30.0


@lru_cache
def get_servo_client() -> httpx.Client:
    """One client per process, for the same reason as get_supabase().

    The client owns a connection pool; building one per request throws away the
    pool and pays for a fresh TLS handshake every time.
    """
    return httpx.Client(timeout=REQUEST_TIMEOUT_SECONDS)


def fetch_prices(client: httpx.Client) -> dict[str, Any]:
    settings = get_settings()

    headers = {
        "User-Agent": "MonashGO/0.1",
        "x-consumer-id": settings.servo_saver_api_key.get_secret_value(),
        "x-transactionid": str(uuid.uuid4()),  # fresh per request, the PDF says so
    }

    try:
        response = client.get(URL, headers=headers)
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise UpstreamServiceError("servo saver api error") from exc

    prices: dict[str, Any] = response.json()
    return prices
