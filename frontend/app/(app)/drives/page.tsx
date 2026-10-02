"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { ArrowRight, Car, Check, Loader2, Sprout } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { RideCard } from "@/components/ride-card";
import { EmptyState, ErrorState, FormError, Skeleton } from "@/components/status-blocks";
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
import { ApiError, completeRide, getMyRides, type Ride } from "@/lib/api";
import { campusLabel } from "@/lib/api";
import { formatDateTime, isUpcoming } from "@/lib/time";
import { useCurrentUser } from "@/lib/use-current-user";
import { useQuery } from "@/lib/use-query";

/**
 * My drives - the driver's half of artboard 1j, on its own page. Every ride
 * the caller has posted, upcoming first, then past.
 */
export default function DrivesPage() {
  const [version, setVersion] = useState(0);
  const rides = useQuery((token) => getMyRides({ token }), [version]);

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
      {rides.status === "loading" && !rides.data && <Skeleton rows={2} />}
      {rides.status === "error" && (
        <ErrorState message="Couldn't load your drives." onRetry={rides.reload} />
      )}
      {rides.data && (
        <DriveList rides={rides.data} onCompleted={() => setVersion((v) => v + 1)} />
      )}
    </AppShell>
  );
}

function DriveList({ rides, onCompleted }: { rides: Ride[]; onCompleted: () => void }) {
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
      {past.length > 0 && (
        <Section title="Past" rides={past} onCompleted={onCompleted} />
      )}
    </div>
  );
}

function Section({
  title,
  rides,
  empty,
  onCompleted,
}: {
  title: string;
  rides: Ride[];
  empty?: string;
  onCompleted?: () => void;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="px-1 text-[13px] font-semibold">{title}</h2>
      {rides.length === 0 ? (
        <p className="px-1 text-xs text-muted-foreground">{empty}</p>
      ) : (
        rides.map((ride) => (
          <div key={ride.id} className="flex flex-col gap-1.5">
            <RideCard ride={ride} showDay />
            {onCompleted && <CompleteRow ride={ride} onCompleted={onCompleted} />}
          </div>
        ))
      )}
    </section>
  );
}

/**
 * The driver confirming the trip happened - artboard 1j's "Mark complete" on a
 * past row. This is the only thing in the product that awards points, so it
 * asks first and says what it will pay.
 */
function CompleteRow({ ride, onCompleted }: { ride: Ride; onCompleted: () => void }) {
  const { getToken } = useAuth();
  const { reload: reloadUser } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [earned, setEarned] = useState<number | null>(null);

  if (ride.status === "cancelled") return null;

  if (ride.status === "completed" || earned !== null) {
    return (
      <p className="px-1 text-xs text-eco-foreground tabular-nums">
        <Check className="mr-1 inline size-3.5" aria-hidden />
        Completed
        {earned !== null && ` · ${earned.toLocaleString()} points each`}
      </p>
    );
  }

  const confirm = async () => {
    setError(null);
    setBusy(true);
    try {
      const result = await completeRide(ride.id, { token: await getToken() });
      setEarned(result.points_earned);
      setOpen(false);
      reloadUser();
      onCompleted();
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status < 500
          ? caught.message
          : "Couldn't complete the ride. Please try again.",
      );
    }
    setBusy(false);
  };

  return (
    <div className="px-1">
      {error && <FormError className="mb-1.5">{error}</FormError>}
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Sprout aria-hidden />
        Mark complete
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Did this trip happen?</DialogTitle>
            <DialogDescription>
              {formatDateTime(ride.departure_at)} · {campusLabel(ride.origin)} &rarr;{" "}
              {campusLabel(ride.destination)}
            </DialogDescription>
          </DialogHeader>
          <DialogBodyNote />
          <DialogFooter>
            <Button variant="outline" size="lg" onClick={() => setOpen(false)} disabled={busy}>
              Not yet
            </Button>
            <Button size="lg" onClick={() => void confirm()} disabled={busy}>
              {busy && <Loader2 className="animate-spin" aria-hidden />}
              Yes, complete it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DialogBodyNote() {
  return (
    <Card className="mx-4 gap-0 border-eco-border bg-eco-muted/40 p-3">
      <p className="text-xs text-eco-foreground">
        Everyone who rode gets the CO₂ saved and the points for it. This can only be done once.
      </p>
    </Card>
  );
}
