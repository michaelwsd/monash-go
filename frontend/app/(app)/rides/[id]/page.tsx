"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { ArrowLeft, Check, Fuel, Loader2, Phone, Route } from "lucide-react";

import { AppShell } from "@/components/app-shell";
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
  getMyBookings,
  getRide,
  type Booking,
  type RideDetail,
} from "@/lib/api";
import { formatDay, formatTime, isUpcoming } from "@/lib/time";
import { useCurrentUser } from "@/lib/use-current-user";
import { useQuery } from "@/lib/use-query";

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
  const ride = useQuery((token) => getRide(id, { token }), [id]);
  const bookings = useQuery((token) => getMyBookings({ token }), []);

  return (
    <AppShell>
      <Link
        href="/rides"
        className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Rides
      </Link>

      {ride.status === "loading" && <Skeleton rows={2} lines={3} />}
      {ride.status === "error" && (
        <ErrorState message={ride.error ?? "Couldn't load this ride."} onRetry={ride.reload} />
      )}
      {ride.status === "ready" && ride.data && (
        <Ride
          ride={ride.data}
          myBooking={
            bookings.data?.find((b) => b.ride_id === ride.data?.id && b.status === "confirmed") ??
            null
          }
          onChanged={() => {
            ride.reload();
            bookings.reload();
          }}
        />
      )}
    </AppShell>
  );
}

function Ride({
  ride,
  myBooking,
  onChanged,
}: {
  ride: RideDetail;
  myBooking: Booking | null;
  onChanged: () => void;
}) {
  const { user } = useCurrentUser();
  const isDriver = user?.id === ride.driver.id;
  const full = ride.available_seats === 0;
  const upcoming = isUpcoming(ride.departure_at);

  return (
    <div className="flex flex-col gap-3.5">
      <Card className="gap-0 p-3.5">
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

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-[1fr_16rem]">
        <Card className="gap-3 p-3.5">
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
          {ride.driver.phone ? (
            <a
              href={`tel:${ride.driver.phone}`}
              className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-eco-border bg-eco-muted px-3 py-2 text-sm font-medium text-eco-foreground tabular-nums hover:bg-eco-muted/70"
            >
              <Phone className="size-3.5" aria-hidden />
              {ride.driver.phone}
            </a>
          ) : (
            !isDriver && (
              <p className="text-xs text-muted-foreground">Phone number shown once you book.</p>
            )
          )}
        </Card>

        <BookingPanel
          ride={ride}
          myBooking={myBooking}
          isDriver={isDriver}
          full={full}
          upcoming={upcoming}
          onChanged={onChanged}
        />
      </div>
    </div>
  );
}

function BookingPanel({
  ride,
  myBooking,
  isDriver,
  full,
  upcoming,
  onChanged,
}: {
  ride: RideDetail;
  myBooking: Booking | null;
  isDriver: boolean;
  full: boolean;
  upcoming: boolean;
  onChanged: () => void;
}) {
  const { getToken } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const run = async (action: (token: string | null) => Promise<unknown>) => {
    setError(null);
    setBusy(true);
    try {
      await action(await getToken());
      onChanged();
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

  if (myBooking) {
    return (
      <Card className="gap-3 border-eco-border bg-eco-muted/40 p-3.5">
        <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-eco-foreground">
          <Check className="size-4" aria-hidden />
          Seat booked
        </p>
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
                      void run((token) => cancelBooking(myBooking.id, { token }));
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
    <Card className="gap-3 p-3.5">
      {seats}
      {error && <FormError>{error}</FormError>}
      <Button
        size="lg"
        className="h-11 w-full"
        disabled={busy || full || !upcoming}
        onClick={() => void run((token) => createBooking(ride.id, { token }))}
      >
        {busy && <Loader2 className="animate-spin" aria-hidden />}
        {!upcoming ? "Departed" : full ? "Full" : busy ? "Booking" : "Book a seat"}
      </Button>
    </Card>
  );
}
