"use client";

import Link from "next/link";
import { ArrowRight, Car, Phone } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { PetCompanion } from "@/components/pet-companion";
import { ErrorState, Skeleton } from "@/components/status-blocks";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { campusLabel, getMyVehicles, getRewards, getShop } from "@/lib/api";
import { formatTime, isUpcoming, relativeDay } from "@/lib/time";
import { useCurrentUser } from "@/lib/use-current-user";
import { useQuery } from "@/lib/use-query";
import { nextTrip, useMyTrips, type Trip } from "@/lib/use-trips";

const LABEL =
  "text-[10px] font-medium tracking-[0.04em] text-muted-foreground uppercase";

/**
 * Home. Artboard 1f, cut down to what the backend can answer today: the next
 * trip, the two things a person comes here to do, and what their bookings add
 * up to. CO2 and rewards return with their endpoints.
 */
export default function DashboardPage() {
  const trips = useMyTrips();
  const vehicles = useQuery((token) => getMyVehicles({ token }), []);
  const rewards = useQuery((token) => getRewards({ token }), []);
  // The shop response carries what is worn and what each item costs, which is
  // everything the companion needs to dress the pet and to say how far off the
  // next purchase is. One request, not two.
  const shop = useQuery((token) => getShop({ token }), []);
  const { user } = useCurrentUser();

  const worn = (shop.data ?? [])
    .filter((item) => item.equipped)
    .map((item) => item.image_url);
  const buyable = (shop.data ?? []).filter(
    (item) => !item.owned && !item.locked,
  );
  const cheapestUnowned = buyable.length
    ? Math.min(...buyable.map((i) => i.cost))
    : null;
  const upcoming =
    trips.data?.filter((t) => isUpcoming(t.ride.departure_at)).length ?? 0;

  return (
    <AppShell>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-[1.5fr_1fr]">
        <div className="sm:col-span-2">
          {trips.status === "loading" && <Skeleton rows={1} lines={3} />}
          {trips.status === "error" && (
            <ErrorState
              message="Couldn't load your trips."
              onRetry={trips.reload}
            />
          )}
          {trips.status === "ready" && trips.data && (
            <NextTrip trip={nextTrip(trips.data)} />
          )}
        </div>

        <Card className="gap-0 p-3.5">
          <p className={LABEL}>Your impact</p>
          <Stats
            trips={trips.data}
            cars={vehicles.data?.length ?? null}
            points={user?.green_points ?? null}
            co2={rewards.data?.total_co2_saved ?? null}
            completed={rewards.data?.completed_trips ?? null}
          />
        </Card>

        <div className="flex flex-col gap-2.5">
          <Button size="lg" className="h-11 w-full justify-center" asChild>
            <Link href="/rides">
              Find a ride
              <ArrowRight aria-hidden />
            </Link>
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="h-11 w-full justify-center"
            asChild
          >
            <Link href="/rides/new">
              <Car aria-hidden />
              Post a drive
            </Link>
          </Button>
        </div>

        {/* Below the two things people come here to do, not above them. The
            pet is the reward for using the product, not the product. */}
        {rewards.data && (
          <div className="sm:col-span-2">
            <PetCompanion
              summary={rewards.data}
              equipped={worn}
              upcoming={upcoming}
              cheapestUnowned={cheapestUnowned}
            />
          </div>
        )}
      </div>
    </AppShell>
  );
}

/**
 * REQ-013 in miniature: what this user's trips add up to. CO2 and completed
 * trips are the backend's own figures from GET /rewards/me - the ones the pet
 * grows on - not something derived here, so the dashboard and the rewards page
 * can never disagree. A null shows as a dash while its source loads, so the
 * tiles keep their place.
 */
function Stats({
  trips,
  cars,
  points,
  co2,
  completed,
}: {
  trips: Trip[] | null;
  cars: number | null;
  points: number | null;
  co2: number | null;
  completed: number | null;
}) {
  const upcoming =
    trips?.filter((t) => isUpcoming(t.ride.departure_at)) ?? null;

  const tiles: { value: string; label: string; eco?: boolean }[] = [
    {
      value: co2 !== null ? `${co2.toFixed(1)} kg` : "–",
      label: "CO₂ avoided",
      eco: true,
    },
    {
      value: points !== null ? points.toLocaleString() : "–",
      label: "green points",
    },
    {
      value: completed !== null ? String(completed) : "–",
      label: "trips completed",
    },
    { value: upcoming ? String(upcoming.length) : "–", label: "coming up" },
    {
      value: cars !== null ? String(cars) : "–",
      label: cars === 1 ? "car" : "cars",
    },
  ];

  return (
    <dl className="mt-2 grid grid-cols-3 gap-x-4 gap-y-3 sm:grid-cols-2">
      {tiles.map(({ value, label, eco }) => (
        <div key={label}>
          <dd
            className={`text-2xl font-semibold tracking-[-0.025em] tabular-nums ${
              eco ? "text-eco-foreground" : ""
            }`}
          >
            {value}
          </dd>
          <dt className={LABEL}>{label}</dt>
        </div>
      ))}
    </dl>
  );
}

function NextTrip({ trip }: { trip: Trip | null }) {
  if (!trip) {
    return (
      <Card className="gap-0 p-3.5">
        <p className={LABEL}>Next trip</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Nothing booked yet.
        </p>
      </Card>
    );
  }

  const { ride } = trip;

  return (
    <Card className="gap-0 p-3.5">
      <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <p className={LABEL}>
            Next trip &middot; {relativeDay(ride.departure_at)}
          </p>
          <p className="mt-0.5 text-xl font-semibold tracking-[-0.025em] tabular-nums">
            {formatTime(ride.departure_at)} {campusLabel(ride.origin)} &rarr;{" "}
            {campusLabel(ride.destination)}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            <span>{ride.driver.full_name}</span>
            <span aria-hidden>&middot;</span>
            <span>
              {ride.vehicle.make} {ride.vehicle.model}
            </span>
          </p>
        </div>

        <div className="flex gap-2 sm:ml-auto">
          {ride.driver.phone && (
            <Button
              variant="outline"
              size="lg"
              className="flex-1 sm:flex-none"
              asChild
            >
              <a href={`tel:${ride.driver.phone}`}>
                <Phone aria-hidden />
                Call
              </a>
            </Button>
          )}
          <Button size="lg" className="flex-1 sm:flex-none" asChild>
            <Link href={`/rides/${ride.id}`}>View trip</Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}
