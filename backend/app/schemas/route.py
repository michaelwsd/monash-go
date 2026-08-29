"""campus_routes models

CampusRouteCreate is what the transform produces and what the repository upserts.
CampusRoute is a row that came back from the database, so it has an id and the
cached_at that route_service tests for freshness.

Note the name clash: core.emissions.TransitLeg is a NamedTuple, deliberately, so
that core/ stays free of pydantic. This TransitLeg is the wire/database shape.
Convert at the boundary, in the service that needs the maths.
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.schemas.enums import Campus, TransitMode, TravelMode


class TransitLeg(BaseModel):
    """one step of a transit journey, as stored in campus_routes.legs"""

    mode: TransitMode
    distance_km: float = Field(ge=0)
    duration_min: int = Field(ge=0)
    # the service name, e.g. "Cranbourne" or "630". walk legs have no line
    line: str | None = None


class CampusRouteBase(BaseModel):
    """the fields the transform fills in, shared by both directions"""

    origin: Campus
    destination: Campus
    travel_mode: TravelMode
    # nullable in the schema: a transit route's total distance is the sum over
    # legs and is not always meaningful, so it is allowed to be absent
    distance_km: float | None = Field(default=None, ge=0)
    # gt, not ge: campus_routes has CHECK (duration_min > 0), so a zero here
    # would pass validation and then be rejected by Postgres. A leg may
    # legitimately round to 0 min; a whole journey may not.
    duration_min: int = Field(gt=0)
    route_summary: str | None = None
    legs: list[TransitLeg] | None = None

    @model_validator(mode="after")
    def check_legs_match_mode(self) -> "CampusRouteBase":
        # a drive row carries no legs. a transit row cannot be costed
        # without them, since transit emissions are the sum over legs,
        # so an empty list is as useless as a missing one
        if self.travel_mode == "drive":
            if self.legs is not None:
                raise ValueError("a drive route has no legs")
        elif not self.legs:
            raise ValueError("a transit route needs at least one leg")
        return self

    @model_validator(mode="after")
    def check_distinct_campuses(self) -> "CampusRouteBase":
        if self.origin == self.destination:
            raise ValueError("a route needs two different campuses")
        return self


class CampusRouteCreate(CampusRouteBase):
    """transform output, and the payload route_repository upserts"""


class CampusRoute(CampusRouteBase):
    """a campus_routes row as read back from the database"""

    id: UUID
    # written explicitly on every upsert, never left to the column default,
    # or a refresh would not move it and the TTL could never fire
    cached_at: datetime
