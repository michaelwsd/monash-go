"""shared enum types"""

from typing import Literal

Campus = Literal["clayton", "caulfield", "peninsula", "parkville", "city"]
UserRole = Literal["passenger", "driver", "both"]
FuelType = Literal["petrol", "diesel", "hybrid", "electric"]
TransitMode = Literal["train", "bus", "tram", "walk"]
PetStage = Literal["egg", "hatched", "juvenile", "adult", "legendary"]
TravelMode = Literal['drive', 'transit']