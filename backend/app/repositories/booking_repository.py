from uuid import UUID

from postgrest import CountMethod
from pydantic import TypeAdapter

from app.schemas.booking import Booking, RpcResult
from supabase import Client

TABLE = "bookings"

RPC_ROWS = TypeAdapter(list[RpcResult])

# A booking that still holds its seat. 'completed' is a confirmed booking whose
# ride has happened, so it counts everywhere a seat counts - the phone number,
# the driver's passenger list, the comparison's rider count. Only 'cancelled'
# gave the seat back.
SEATED = ("confirmed", "completed")


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


def get_seat(db: Client, *, ride_id: UUID, passenger_id: UUID) -> Booking | None:
    """This passenger's booking on this ride, if it still holds a seat.

    Confirmed or completed. A cancelled booking gave the seat back, so it must
    not keep the driver's phone number visible; a completed one rode the trip,
    so it must.
    """
    res = (
        db.table(TABLE)
        .select("*")
        .eq("ride_id", str(ride_id))
        .eq("passenger_id", str(passenger_id))
        .in_("status", SEATED)
        .limit(1)
        .execute()
    )
    return Booking.model_validate(res.data[0]) if res.data else None


def count_seated(db: Client, *, ride_id: UUID) -> int:
    """How many passengers hold a seat on this ride, before or after it ran."""
    count = (
        db.table(TABLE)
        .select("id", count=CountMethod.exact)  # asks postgres to send the count number back
        .eq("ride_id", str(ride_id))
        .in_("status", SEATED)
        .execute()
    ).count

    return count or 0


def list_confirmed_for_ride(db: Client, *, ride_id: UUID) -> list[Booking]:
    """Bookings not yet completed, in the order the seats were taken.

    For completion, which is what turns them into 'completed'. Anything that
    asks "who is on this ride?" wants list_seated_for_ride instead.
    """
    res = (
        db.table(TABLE)
        .select("*")
        .eq("ride_id", str(ride_id))
        .eq("status", "confirmed")
        .order("created_at")
        .execute()
    )
    return [Booking.model_validate(row) for row in res.data]


def list_seated_for_ride(db: Client, *, ride_id: UUID) -> list[Booking]:
    """Everyone with a seat on this ride, before or after it ran, in the order
    the seats were taken."""
    res = (
        db.table(TABLE)
        .select("*")
        .eq("ride_id", str(ride_id))
        .in_("status", SEATED)
        .order("created_at")
        .execute()
    )
    return [Booking.model_validate(row) for row in res.data]


def count_completed_for_passenger(db: Client, *, passenger_id: UUID) -> int:
    """Trips this user has finished as a passenger."""
    res = (
        db.table(TABLE)
        .select("id", count=CountMethod.exact)
        .eq("passenger_id", str(passenger_id))
        .eq("status", "completed")
        .execute()
    )
    return res.count or 0
