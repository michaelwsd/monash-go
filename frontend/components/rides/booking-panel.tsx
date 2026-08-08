import { Button, ButtonLink, Card, CardKicker, Tag } from "@/components/ui";
import { bookSeat } from "@/lib/actions/bookings";
import { pointsFor } from "@/lib/emissions";
import { formatCo2, formatMoney, formatPoints } from "@/lib/format";
import type { Ride } from "@/lib/types";

interface BookingPanelProps {
  ride: Ride;
  costPerPersonAud: number;
  co2AvoidedKg: number;
  /** Set when the reader already holds a booking on this ride. */
  viewerBookingId: string | null;
}

/**
 * The book-a-seat action.
 *
 * A `<form>` posting to a Server Action, not a button with an onClick. That
 * keeps the whole ride page a Server Component, makes the action work before
 * JavaScript has loaded, and puts the atomic seat decrement on the server where
 * the row lock lives.
 *
 * Points are quoted as approximate and as pending, because they are: they are
 * calculated from the final passenger count when the ride is marked complete, so
 * a number promised here would be wrong the moment another rider joins.
 */
export function BookingPanel({
  ride,
  costPerPersonAud,
  co2AvoidedKg,
  viewerBookingId,
}: BookingPanelProps) {
  const isFull = ride.availableSeats === 0;

  // Already aboard. Offering the seat again would let a rider double-book the
  // ride they are looking at — `UNIQUE(ride_id, passenger_id)` would reject it,
  // but only after the click.
  if (viewerBookingId) {
    return (
      <Card className="gap-2 p-4">
        <CardKicker>Your seat</CardKicker>
        <Tag tone="sage" className="self-start">
          You&rsquo;re booked on this ride
        </Tag>
        <p className="m-0 text-xs text-ink/65">
          You avoid {formatCo2(co2AvoidedKg)} CO₂ and pay about{" "}
          {formatMoney(costPerPersonAud)}.
        </p>
        <ButtonLink
          href={`/bookings/${viewerBookingId}`}
          variant="secondary"
          size="lg"
          fullWidth
          className="mt-1"
        >
          View booking
        </ButtonLink>
      </Card>
    );
  }

  return (
    <Card className="gap-2 p-4">
      <CardKicker>Seats</CardKicker>

      <p className="font-display text-xl leading-none">
        {isFull
          ? "None left"
          : `${ride.availableSeats} of ${ride.totalSeats} left`}
      </p>

      {isFull ? (
        <Tag tone="neutral" className="mt-2 self-start">
          This ride is full
        </Tag>
      ) : (
        <form action={bookSeat} className="mt-2 flex flex-col gap-2">
          <input type="hidden" name="rideId" value={ride.id} />
          <Button type="submit" variant="sage" size="lg" fullWidth>
            Book a seat
          </Button>
          <p className="text-center text-xs text-ink/60">
            About {formatMoney(costPerPersonAud)} · earns roughly{" "}
            {formatPoints(pointsFor(co2AvoidedKg))} green points
          </p>
          <p className="text-center text-xs text-ink/60">
            You avoid {formatCo2(co2AvoidedKg)} CO₂ versus driving yourself
          </p>
        </form>
      )}
    </Card>
  );
}
