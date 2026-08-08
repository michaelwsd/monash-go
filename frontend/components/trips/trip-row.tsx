import { Button, ButtonLink, Card, Tag } from "@/components/ui";
import { cancelBooking } from "@/lib/actions/bookings";
import { markRideComplete } from "@/lib/actions/rides";
import { cn } from "@/lib/cn";
import {
  formatCo2,
  formatDayTime,
  formatMoney,
  formatPoints,
  formatRoute,
} from "@/lib/format";
import type { Trip } from "@/lib/types";

/**
 * True once the ride has happened but has not been settled.
 *
 * `in_progress` is the state that owes an action: the trip is over, the final
 * passenger count is known, and until the driver marks it complete no CO2 is
 * credited and no points are awarded. Everything about this row's styling is
 * downstream of making that state visible rather than letting it look finished.
 */
function needsCompletion(trip: Trip): boolean {
  return trip.role === "driver" && trip.ride.status === "in_progress";
}

export function TripRow({ trip }: { trip: Trip }) {
  const { ride } = trip;
  const isPast = ride.status === "completed" || ride.status === "in_progress";
  const awaiting = needsCompletion(trip);

  return (
    <Card
      as="li"
      elevation={awaiting ? "sm" : "none"}
      className={cn(
        "gap-3 p-4 sm:flex-row sm:items-center sm:gap-4",
        awaiting && "ring-2 ring-clay",
        ride.status === "completed" && "bg-sand-100",
      )}
    >
      <Tag
        tone={trip.role === "driver" ? "clay" : "neutral"}
        className="w-fit justify-center sm:min-w-18"
      >
        {trip.role === "driver" ? "Driver" : "Passenger"}
      </Tag>

      <div className="min-w-0 flex-1">
        <p className="m-0 text-sm font-semibold">
          {formatDayTime(ride.departureAt)} ·{" "}
          {formatRoute(ride.origin, ride.destination)}
        </p>

        <p className="m-0 mt-1 text-xs text-ink/65">{trip.counterparty}</p>

        {isPast ? (
          <ul className="mt-2 flex flex-wrap list-none gap-x-4 gap-y-1 p-0 text-xs">
            {trip.co2AvoidedKg !== null ? (
              <li className="font-semibold text-sage-700">
                avoided {formatCo2(trip.co2AvoidedKg)}
              </li>
            ) : null}
            {trip.costAud !== null ? (
              <li>
                {trip.role === "driver" ? "fuel " : "owed "}
                {formatMoney(trip.costAud)}
              </li>
            ) : null}
            {trip.pointsEarned !== null ? (
              <li className="text-ink/65">
                +{formatPoints(trip.pointsEarned)} pts
              </li>
            ) : null}
            {awaiting ? (
              <li className="font-semibold text-clay-700">
                not settled — no points awarded yet
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {awaiting ? (
          <form action={markRideComplete}>
            <input type="hidden" name="rideId" value={ride.id} />
            <Button type="submit" variant="primary" size="md">
              Mark complete
            </Button>
          </form>
        ) : ride.status === "completed" ? (
          <Tag tone="sage">Completed</Tag>
        ) : trip.role === "driver" ? (
          <ButtonLink href={`/rides/${ride.id}`} variant="secondary" size="md">
            Manage
          </ButtonLink>
        ) : (
          <>
            <ButtonLink href={`/bookings/${trip.id}`} variant="secondary" size="md">
              Details
            </ButtonLink>
            <form action={cancelBooking}>
              <input type="hidden" name="bookingId" value={trip.id} />
              <Button type="submit" variant="ghost" size="md">
                Cancel
              </Button>
            </form>
          </>
        )}
      </div>
    </Card>
  );
}
