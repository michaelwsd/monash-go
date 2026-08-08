import { MapPin } from "lucide-react";

import { ButtonLink, Card, CardKicker, Icon, Tag } from "@/components/ui";
import { formatRelativeDay, formatRoute, formatTime, formatVehicle } from "@/lib/format";
import type { Trip, Vehicle } from "@/lib/types";

interface NextTripCardProps {
  trip: Trip;
  vehicle: Vehicle;
  pickupPoint: string | null;
  /** Captured once by the page so the server and client agree on "tomorrow". */
  now: Date;
}

/**
 * The dashboard's hero: the trip that is about to happen.
 *
 * Departure time is the display-face number because it is the one thing the
 * reader is checking. The route sits beside it at the same weight, and
 * everything else — driver, car, pick-up bay — is one step down.
 */
export function NextTripCard({ trip, vehicle, pickupPoint, now }: NextTripCardProps) {
  const { ride } = trip;

  return (
    <Card
      elevation="sm"
      className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-5"
    >
      <div className="min-w-0 flex-1">
        <CardKicker>Next trip · {formatRelativeDay(ride.departureAt, now)}</CardKicker>

        <p className="mt-1 font-display text-xl leading-tight sm:text-2xl">
          {formatTime(ride.departureAt)} {formatRoute(ride.origin, ride.destination)}
        </p>

        <p className="mt-1 text-sm text-ink/70">
          {trip.role === "passenger"
            ? `${trip.counterparty} · ${formatVehicle(vehicle)}`
            : trip.counterparty}
        </p>

        {pickupPoint ? (
          <p className="mt-2 inline-flex items-center gap-1 text-xs text-ink/70">
            <Icon as={MapPin} size={13} />
            {pickupPoint}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Tag tone={trip.role === "driver" ? "clay" : "neutral"}>
          {trip.role === "driver" ? "Driving" : "Riding"}
        </Tag>
        <ButtonLink
          href={trip.role === "passenger" ? `/bookings/${trip.id}` : "/trips"}
          variant="primary"
          size="lg"
        >
          {trip.role === "passenger" ? "View trip" : "Manage"}
        </ButtonLink>
      </div>
    </Card>
  );
}
