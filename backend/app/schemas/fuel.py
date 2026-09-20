from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.schemas.enums import FuelType


class FuelPrice(BaseModel):
    id: UUID
    fuel_type: FuelType
    price_per_litre: float
    fetched_at: datetime
