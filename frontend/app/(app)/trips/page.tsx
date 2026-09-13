"use client";

import Link from "next/link";
import { ArrowRight, CalendarCheck, ChevronRight } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { EmptyState, ErrorState, Skeleton } from "@/components/status-blocks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { campusLabel } from "@/lib/api";
import { formatDay, formatTime, isUpcoming } from "@/lib/time";
import { useMyTrips, type Trip } from "@/lib/use-trips";

const LABEL = "text-[10px] font-medium tracking-[0.04em] text-muted-foreground uppercase";

/**
 * My trips, as a passenger (artboard 1j). The "as driver" half needs an
 * endpoint that lists a driver's own rides, which does not exist yet, so it
 * is left out rather than faked.
 *
 * Cancelling lives on the ride page: one place for the action and its
 * confirmation, reached from here in one tap.
 */
export default function TripsPage() {
  const trips = useMyTrips();

  return (
    <AppShell title="My trips">
      {trips.status === "loading" && <Skeleton rows={2} />}
      {trips.status === "error" && (
        <ErrorState message="Couldn't load your trips." onRetry={trips.reload} />
      )}
      {trips.status === "ready" && trips.data && (
        <TripList trips={trips.data} />
      )}
    </AppShell>
  );
}

function TripList({ trips }: { trips: Trip[] }) {
  const upcoming = trips.filter((t) => isUpcoming(t.ride.departure_at));
  const past = trips.filter((t) => !isUpcoming(t.ride.departure_at)).reverse();

  if (trips.length === 0) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title="No trips yet"
        body="Book a seat and it'll show up here."
        action={
          <Button size="lg" asChild>
            <Link href="/rides">
              Find a ride
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Section title="Upcoming" trips={upcoming} empty="Nothing coming up." />
      {past.length > 0 && <Section title="Past" trips={past} />}
    </div>
  );
}

function Section({ title, trips, empty }: { title: string; trips: Trip[]; empty?: string }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="px-1 text-[13px] font-semibold">{title}</h2>
      {trips.length === 0 ? (
        <p className="px-1 text-xs text-muted-foreground">{empty}</p>
      ) : (
        trips.map((trip) => <TripRow key={trip.booking.id} trip={trip} />)
      )}
    </section>
  );
}

function TripRow({ trip: { ride } }: { trip: Trip }) {
  const upcoming = isUpcoming(ride.departure_at);

  return (
    <Link
      href={`/rides/${ride.id}`}
      className="group rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <Card
        className={`flex-row items-center gap-3 p-3 transition-colors group-hover:bg-muted/60 ${
          upcoming ? "" : "opacity-70"
        }`}
      >
        <div className="min-w-[56px] text-center">
          <p className="text-lg font-semibold tracking-[-0.025em] tabular-nums">
            {formatTime(ride.departure_at)}
          </p>
          <p className={LABEL}>{formatDay(ride.departure_at)}</p>
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">
            {campusLabel(ride.origin)} &rarr; {campusLabel(ride.destination)}
          </p>
          <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
            {ride.driver.full_name} &middot; {ride.vehicle.make} {ride.vehicle.model}
          </p>
        </div>

        <Badge
          variant="outline"
          className={`hidden rounded-full font-medium sm:inline-flex ${
            upcoming ? "border-eco-border bg-eco-muted text-eco-foreground" : ""
          }`}
        >
          {upcoming ? "Booked" : "Done"}
        </Badge>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Card>
    </Link>
  );
}
