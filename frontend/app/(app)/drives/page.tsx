"use client";

import Link from "next/link";
import { ArrowRight, Car } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { RideCard } from "@/components/ride-card";
import { EmptyState, ErrorState, Skeleton } from "@/components/status-blocks";
import { Button } from "@/components/ui/button";
import { getMyRides, type Ride } from "@/lib/api";
import { isUpcoming } from "@/lib/time";
import { useQuery } from "@/lib/use-query";

/**
 * My drives - the driver's half of artboard 1j, on its own page. Every ride
 * the caller has posted, upcoming first, then past.
 */
export default function DrivesPage() {
  const rides = useQuery((token) => getMyRides({ token }), []);

  return (
    <AppShell
      title="My drives"
      action={
        rides.data && rides.data.length > 0 ? (
          <Button size="lg" className="w-full sm:w-auto" asChild>
            <Link href="/rides/new">
              <Car aria-hidden />
              Post a drive
            </Link>
          </Button>
        ) : undefined
      }
    >
      {rides.status === "loading" && <Skeleton rows={2} />}
      {rides.status === "error" && (
        <ErrorState message="Couldn't load your drives." onRetry={rides.reload} />
      )}
      {rides.status === "ready" && rides.data && <DriveList rides={rides.data} />}
    </AppShell>
  );
}

function DriveList({ rides }: { rides: Ride[] }) {
  if (rides.length === 0) {
    return (
      <EmptyState
        icon={Car}
        title="No drives posted"
        body="Offer a seat on your next trip between campuses."
        action={
          <Button size="lg" asChild>
            <Link href="/rides/new">
              Post a drive
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        }
      />
    );
  }

  // The API answers newest departure first; upcoming reads better soonest first.
  const upcoming = rides.filter((r) => isUpcoming(r.departure_at)).reverse();
  const past = rides.filter((r) => !isUpcoming(r.departure_at));

  return (
    <div className="flex flex-col gap-5">
      <Section title="Upcoming" rides={upcoming} empty="Nothing coming up." />
      {past.length > 0 && <Section title="Past" rides={past} />}
    </div>
  );
}

function Section({ title, rides, empty }: { title: string; rides: Ride[]; empty?: string }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="px-1 text-[13px] font-semibold">{title}</h2>
      {rides.length === 0 ? (
        <p className="px-1 text-xs text-muted-foreground">{empty}</p>
      ) : (
        rides.map((ride) => <RideCard key={ride.id} ride={ride} showDay />)
      )}
    </section>
  );
}
