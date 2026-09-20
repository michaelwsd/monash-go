"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { ArrowLeft, Check, Fuel, Loader2, Phone, Route, Users } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { ComparisonPanel } from "@/components/comparison-panel";
import { ErrorState, FormError, Skeleton } from "@/components/status-blocks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fuelTypeLabel } from "@/components/vehicle-picker";
import {
  ApiError,
  campusLabel,
  cancelBooking,
  createBooking,
  getComparison,
  getMyBookings,
  getRide,
  getRidePassengers,
  type Booking,
  type ModeComparison,
  type RideDetail,
} from "@/lib/api";
import { formatDay, formatTime, isUpcoming } from "@/lib/time";
import { useCurrentUser } from "@/lib/use-current-user";
import { useQuery } from "@/lib/use-query";
import { cn } from "@/lib/utils";

const LABEL = "text-[10px] font-medium tracking-[0.04em] text-muted-foreground uppercase";

/**
 * One ride, and the button that books it (artboards 1g and 1i, less the
 * comparison and pick-up point, which the backend does not have yet).
 *
 * Two fetches: the ride, and the caller's bookings. The ride alone says
 * whether the caller is booked - the driver's phone is present only then -
 * but cancelling needs the booking's own id, which only the second gives.
 */
export default function RidePage() {
  const { id } = useParams<{ id: string }>();
  // Bumped after a booking is made or cancelled. Everything on the page that
  // can change with a seat - the ride, my bookings, the comparison - keys on it.
  const [version, setVersion] = useState(0);
  const ride = useQuery((token) => getRide(id, { token }), [id, version]);
  const bookings = useQuery((token) => getMyBookings({ token }), [version]);

  return (
    <AppShell>
      <Link
        href="/rides"
        className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Rides
      </Link>

      {ride.status === "loading" && !ride.data && <Skeleton rows={2} lines={3} />}
      {ride.status === "error" && (
        <ErrorState message={ride.error ?? "Couldn't load this ride."} onRetry={ride.reload} />
      )}
      {/* Rendered whenever there is data, loading or not: a refetch after
          booking updates the page in place instead of swapping it for a
          skeleton and back. */}
      {ride.data && (
        <Ride
          ride={ride.data}
          version={version}
          myBooking={
            bookings.data?.find((b) => b.ride_id === ride.data?.id && b.status === "confirmed") ??
            null
          }
          onChanged={() => setVersion((v) => v + 1)}
        />
      )}
    </AppShell>
  );
}

function Ride({
  ride,
  version,
  myBooking,
  onChanged,
}: {
  ride: RideDetail;
  version: number;
  myBooking: Booking | null;
  onChanged: () => void;
}) {
  const { user } = useCurrentUser();
  const isDriver = user?.id === ride.driver.id;
  const full = ride.available_seats === 0;
  const upcoming = isUpcoming(ride.departure_at);

  // The server's answer to "am I booked?" arrives a round trip after the
  // booking itself does. Until then the page shows what it already knows:
  // POST /bookings returned the booking, so the seat is booked now. undefined
  // means "no override, trust the fetch"; null means "just cancelled".
  const [optimistic, setOptimistic] = useState<Booking | null | undefined>(undefined);
  const booking = optimistic === undefined ? myBooking : optimistic;

  // Fetched once here; the panel shows it and the booked state quotes the
  // carpool row. For the driver the endpoint counts riders as confirmed + 1,
  // which is precisely "what the next rider will see" - artboard 1h's preview.
  const comparison = useQuery((token) => getComparison(ride.id, { token }), [ride.id, version]);
  const seat = comparison.data?.modes.find((m) => m.mode === "carpool") ?? null;

  return (
    /* DOM order is the phone order, and the decision order: what the trip is,
       how it compares, book it, who is driving. From sm up the same four are
       placed on a two-column grid with the booking pinned right, so no
       order-* utilities and nothing renders twice. */
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-[1fr_16rem]">
      <Card className="gap-0 p-3.5 sm:col-span-2">
        <p className={LABEL}>
          {formatDay(ride.departure_at)} &middot; {ride.distance_km.toFixed(1)} km
        </p>
        <p className="mt-0.5 text-2xl font-semibold tracking-[-0.025em] tabular-nums">
          {formatTime(ride.departure_at)} {campusLabel(ride.origin)} &rarr;{" "}
          {campusLabel(ride.destination)}
        </p>
        {ride.route_summary && (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Route className="size-3.5" aria-hidden />
            via {ride.route_summary}
          </p>
        )}
      </Card>

      <div className="sm:col-start-1 sm:row-start-2">
        <ComparisonPanel comparison={comparison} />
      </div>

      <div className="sm:col-start-2 sm:row-start-2 sm:row-span-3 sm:self-start sm:sticky sm:top-4">
        <BookingPanel
          ride={ride}
          booking={booking}
          isDriver={isDriver}
          full={full}
          upcoming={upcoming}
          seat={seat}
          onBooked={(made) => {
            setOptimistic(made);
            onChanged();
          }}
          onCancelled={() => {
            setOptimistic(null);
            onChanged();
          }}
        />
      </div>

      {isDriver && (
        <div className="sm:col-start-1 sm:row-start-3">
          <Passengers rideId={ride.id} refreshKey={version} total={ride.total_seats} />
        </div>
      )}

      <Card className={cn("gap-3 p-3.5 sm:col-start-1", isDriver ? "sm:row-start-4" : "sm:row-start-3")}>
        <div>
          <p className={LABEL}>Driver</p>
          <p className="mt-0.5 text-base font-semibold tracking-[-0.02em]">
            {ride.driver.full_name}
            {isDriver && <span className="ml-2 text-xs font-normal text-muted-foreground">you</span>}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">
            {ride.vehicle.make} {ride.vehicle.model}
            <span className="text-muted-foreground"> {ride.vehicle.year}</span>
          </span>
          <Badge variant="secondary" className="gap-1 rounded-full font-medium">
            <Fuel className="size-3" aria-hidden />
            {fuelTypeLabel(ride.vehicle.fuel_type)}
          </Badge>
        </div>

        {/* Presence of the key is the signal: the backend picks a response
            model with or without it depending on whether the caller holds a
            confirmed seat. */}
        {/* The number is on the ride response, which is refetched after a
            booking - so for one round trip the seat is booked and the number
            has not arrived. Saying so makes its appearance expected rather than
            a surprise. */}
        {ride.driver.phone && booking ? (
          <a
            href={`tel:${ride.driver.phone}`}
            className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-eco-border bg-eco-muted px-3 py-2 text-sm font-medium text-eco-foreground tabular-nums hover:bg-eco-muted/70 animate-in fade-in-0 duration-300 motion-reduce:animate-none"
          >
            <Phone className="size-3.5" aria-hidden />
            {ride.driver.phone}
          </a>
        ) : booking ? (
          <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" aria-hidden />
            Getting the driver&apos;s number
          </p>
        ) : (
          !isDriver && (
            <p className="text-xs text-muted-foreground">Phone number shown once you book.</p>
          )
        )}
      </Card>
    </div>
  );
}

function BookingPanel({
  ride,
  booking,
  isDriver,
  full,
  upcoming,
  seat,
  onBooked,
  onCancelled,
}: {
  ride: RideDetail;
  booking: Booking | null;
  isDriver: boolean;
  full: boolean;
  upcoming: boolean;
  seat: ModeComparison | null;
  onBooked: (booking: Booking) => void;
  onCancelled: () => void;
}) {
  const { getToken } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const run = async (action: (token: string | null) => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await action(await getToken());
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status < 500
          ? caught.message
          : "Something went wrong. Please try again.",
      );
    }
    setBusy(false);
  };

  const seats = (
    <div>
      <p className={LABEL}>Seats</p>
      <p className="mt-0.5 text-sm tabular-nums">
        {full ? "None left" : `${ride.available_seats} of ${ride.total_seats} left`}
      </p>
    </div>
  );

  if (isDriver) {
    return (
      <Card className="gap-3 p-3.5">
        {seats}
        <p className="text-xs text-muted-foreground">This is your drive.</p>
      </Card>
    );
  }

  if (booking) {
    return (
      <Card className="gap-3 border-eco-border bg-eco-muted/40 p-3.5 animate-in fade-in-0 duration-300 motion-reduce:animate-none">
        <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-eco-foreground">
          <Check className="size-4" aria-hidden />
          Seat booked
        </p>
        {seat && <YourSeat seat={seat} />}
        {seats}
        {error && <FormError>{error}</FormError>}
        {upcoming && (
          <>
            <Button
              variant="outline"
              size="lg"
              className="w-full"
              disabled={busy}
              onClick={() => setConfirmCancel(true)}
            >
              Cancel seat
            </Button>
            <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Cancel your seat?</DialogTitle>
                  <DialogDescription>
                    {formatDay(ride.departure_at)}, {formatTime(ride.departure_at)} &middot;{" "}
                    {campusLabel(ride.origin)} &rarr; {campusLabel(ride.destination)}
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" size="lg" onClick={() => setConfirmCancel(false)}>
                    Keep it
                  </Button>
                  <Button
                    variant="destructive"
                    size="lg"
                    disabled={busy}
                    onClick={() => {
                      setConfirmCancel(false);
                      void run(async (token) => {
                        await cancelBooking(booking.id, { token });
                        onCancelled();
                      });
                    }}
                  >
                    Cancel seat
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}
      </Card>
    );
  }

  return (
    <Card className="gap-3 p-3.5 animate-in fade-in-0 duration-300 motion-reduce:animate-none">
      {seats}
      {error && <FormError>{error}</FormError>}
      <Button
        size="lg"
        className="h-11 w-full"
        disabled={busy || full || !upcoming}
        onClick={() =>
          void run(async (token) => {
            onBooked(await createBooking(ride.id, { token }));
          })
        }
      >
        {busy && <Loader2 className="animate-spin" aria-hidden />}
        {!upcoming ? "Departed" : full ? "Full" : busy ? "Booking" : "Book a seat"}
      </Button>
    </Card>
  );
}

/**
 * Artboard 1i's "you'll pay about": the carpool row's own cost and CO2 for
 * the seat just booked. Both are fields on the comparison, nothing derived.
 * Absent if the comparison is unavailable - the booking stands either way.
 */
function YourSeat({ seat }: { seat: ModeComparison }) {
  return (
    <ul className="space-y-1 text-xs text-muted-foreground tabular-nums animate-in fade-in-0 duration-300 motion-reduce:animate-none">
      <li className="flex items-baseline gap-2">
        <span className="size-1 shrink-0 translate-y-[-2px] rounded-full bg-eco" aria-hidden />
        <span>
          <span className="font-medium text-foreground">${seat.cost.toFixed(2)}</span>
          {" "}for the seat
        </span>
      </li>
      <li className="flex items-baseline gap-2">
        <span className="size-1 shrink-0 translate-y-[-2px] rounded-full bg-eco" aria-hidden />
        <span>
          <span className="font-medium text-foreground">{seat.co2_kg.toFixed(2)}</span>
          {" "}kg CO&#8322;
        </span>
      </li>
    </ul>
  );
}

/**
 * Who has a seat, for the driver. Each row is a name and a tappable number,
 * so the person doing the pick-up can call without leaving the page. Keyed on
 * `refreshKey` so a cancellation elsewhere drops out on the next reload.
 */
function Passengers({
  rideId,
  refreshKey,
  total,
}: {
  rideId: string;
  refreshKey: number;
  total: number;
}) {
  const passengers = useQuery(
    (token) => getRidePassengers(rideId, { token }),
    [rideId, refreshKey],
  );

  if (passengers.status === "loading" && !passengers.data) return <Skeleton rows={1} />;
  if (passengers.status === "error" || !passengers.data) return null;

  return (
    <Card className="gap-3 p-3.5">
      <p className={LABEL}>
        Passengers &middot; {passengers.data.length} of {total}
      </p>

      {passengers.data.length === 0 ? (
        <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="size-3.5" aria-hidden />
          Nobody booked yet.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {passengers.data.map((p) => (
            <li key={p.booking_id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
              <span className="min-w-0 truncate text-sm font-medium">{p.full_name}</span>
              <a
                href={`tel:${p.phone}`}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-eco-border bg-eco-muted px-2.5 py-1.5 text-xs font-medium text-eco-foreground tabular-nums hover:bg-eco-muted/70"
              >
                <Phone className="size-3" aria-hidden />
                {p.phone}
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
