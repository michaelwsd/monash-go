import { CalendarPlus, Check, MessageSquare, Phone } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  Avatar,
  Button,
  ButtonLink,
  Callout,
  Card,
  CardKicker,
  Icon,
} from "@/components/ui";
import { cancelBooking } from "@/lib/actions/bookings";
import { getBookingConfirmation } from "@/lib/data/queries";
import {
  formatCo2,
  formatDayTime,
  formatMoney,
  formatPoints,
  formatRoute,
  formatTime,
  formatVehicle,
} from "@/lib/format";

export const metadata: Metadata = {
  title: "Seat booked",
};

/**
 * Wireframe 1i — booking confirmation.
 *
 * The screen exists for one moment: the driver's phone number unlocks here and
 * nowhere earlier. That is enforced by the data layer — this is the only query
 * that returns a `DriverContact` — so the rule cannot be broken by a component
 * forgetting a conditional.
 *
 * Points are shown as pending rather than awarded. They are calculated from the
 * final passenger count when the ride is marked complete, so anything stated as
 * earned here would be a number the system has not committed to.
 */
export default async function BookingConfirmationPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  const confirmation = await getBookingConfirmation(bookingId);

  if (!confirmation) notFound();

  const { booking, ride, driver, vehicle } = confirmation;
  // `tel:` and `sms:` need the digits only — a space breaks the handler on iOS.
  const dialable = driver.phone.replace(/\s+/g, "");

  return (
    <div className="mx-auto flex max-w-md flex-col gap-3">
      <div className="flex flex-col items-center gap-2 py-4 text-center">
        <span className="flex size-13 items-center justify-center rounded-full bg-sage text-ground">
          <Icon as={Check} size={26} />
        </span>
        <h1 className="text-2xl">Seat booked</h1>
        <p className="text-sm text-ink/70">{formatDayTime(ride.departureAt)}</p>
      </div>

      <Card className="gap-1 p-4">
        <CardKicker>{formatRoute(ride.origin, ride.destination)}</CardKicker>
        <p className="m-0 mt-1 text-sm leading-relaxed">
          Pick-up: {confirmation.pickupPoint ?? "to be confirmed by the driver"}
          <br />
          Arrive by {formatTime(confirmation.arriveByAt)}
        </p>
      </Card>

      <Card className="gap-3 p-4">
        <div className="flex items-center gap-3">
          <Avatar name={driver.displayName} src={driver.avatarUrl} size="lg" />
          <div className="min-w-0">
            <p className="font-display text-base leading-tight">
              {driver.displayName}
            </p>
            <p className="text-xs text-ink/70">
              {driver.phone} · {formatVehicle(vehicle)}
            </p>
          </div>
        </div>

        {/*
          `tel:` and `sms:` links rather than in-app messaging. There is no
          messaging service in the backend design, and inventing one to power two
          buttons would be a large feature hiding behind a small control. These
          work today, on the device the rider is holding.
        */}
        <div className="flex gap-2">
          <ButtonLink
            href={`tel:${dialable}`}
            variant="secondary"
            size="lg"
            className="flex-1"
          >
            <Icon as={Phone} size={15} />
            Call
          </ButtonLink>
          <ButtonLink
            href={`sms:${dialable}`}
            variant="secondary"
            size="lg"
            className="flex-1"
          >
            <Icon as={MessageSquare} size={15} />
            Message
          </ButtonLink>
        </div>
      </Card>

      <Callout tone="positive" className="leading-relaxed">
        <p className="m-0">
          You&rsquo;ll avoid <strong>{formatCo2(confirmation.co2AvoidedKg)} CO₂</strong>{" "}
          and pay about <strong>{formatMoney(confirmation.costAud)}</strong>.
        </p>
        <p className="m-0 mt-1 opacity-80">
          Roughly {formatPoints(confirmation.pendingPoints)} green points land when
          the trip is marked complete.
        </p>
      </Callout>

      {/* A real download, served by the sibling route handler. */}
      <ButtonLink
        href={`/bookings/${booking.id}/calendar`}
        variant="secondary"
        size="lg"
        fullWidth
        // Tells Next to do a normal navigation so the browser handles the file
        // rather than trying a client-side transition into a non-page route.
        prefetch={false}
      >
        <Icon as={CalendarPlus} size={15} />
        Add to calendar
      </ButtonLink>

      <form action={cancelBooking}>
        <input type="hidden" name="bookingId" value={booking.id} />
        <Button type="submit" variant="ghost" size="md" fullWidth>
          Cancel this booking
        </Button>
      </form>

      <p className="text-center text-xs text-ink/55">
        Cancel free up to 1 hour before departure.
      </p>
    </div>
  );
}
