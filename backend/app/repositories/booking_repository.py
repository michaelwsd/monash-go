from uuid import UUID

from postgrest import CountMethod
from pydantic import TypeAdapter

from app.schemas.booking import Booking, RpcResult
from supabase import Client

TABLE = "bookings"

RPC_ROWS = TypeAdapter(list[RpcResult])


def book_seat(db: Client, *, ride_id: UUID, passenger_id: UUID) -> tuple[str, UUID | None]:
    res = db.rpc(
        "book_seat", {"p_ride_id": str(ride_id), "p_passenger_id": str(passenger_id)}
    ).execute()

    row = RPC_ROWS.validate_python(res.data)[0]
    return row.result, row.booking_id


def cancel(db: Client, *, booking_id: UUID, passenger_id: UUID) -> str:
    res = db.rpc(
        "cancel_booking", {"p_booking_id": str(booking_id), "p_passenger_id": str(passenger_id)}
    ).execute()

    row = RPC_ROWS.validate_python(res.data)[0]
    return row.result


def get_by_id(db: Client, booking_id: UUID) -> Booking | None:
    res = db.table(TABLE).select("*").eq("id", str(booking_id)).limit(1).execute()
    return Booking.model_validate(res.data[0]) if res.data else None


def list_for_passenger(db: Client, *, passenger_id: UUID) -> list[Booking]:
    res = (
        db.table(TABLE)
        .select("*")
        .eq("passenger_id", str(passenger_id))
        .order("created_at", desc=True)
        .execute()
    )
    return [Booking.model_validate(row) for row in res.data]


def get_confirmed(db: Client, *, ride_id: UUID, passenger_id: UUID) -> Booking | None:
    """This passenger's live booking on this ride, if they have one.

    Confirmed only. A cancelled booking gave the seat back, so it must not keep
    the driver's phone number visible.
    """
    res = (
        db.table(TABLE)
        .select("*")
        .eq("ride_id", str(ride_id))
        .eq("passenger_id", str(passenger_id))
        .eq("status", "confirmed")
        .limit(1)
        .execute()
    )
    return Booking.model_validate(res.data[0]) if res.data else None


# count number of confirmed passengers for this ride
def count_confirmed(db: Client, *, ride_id: UUID) -> int:
    count = (
        db.table(TABLE)
        .select("id", count=CountMethod.exact)  # asks postgres to send the count number back
        .eq("ride_id", str(ride_id))
        .eq("status", "confirmed")
        .execute()
    ).count

    return count or 0
