import { CarFront, Search } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";

import { ImpactCard } from "@/components/home/impact-card";
import { NextTripCard } from "@/components/home/next-trip-card";
import { RewardsProgressCard } from "@/components/home/rewards-progress-card";
import { ROUTES } from "@/components/layout/routes";
import { ButtonLink, Callout, Icon } from "@/components/ui";
import { getCurrentUser, getImpact, getNextTrip, getRewards } from "@/lib/data/queries";
import { timeOfDayGreeting } from "@/lib/format";

export const metadata: Metadata = {
  title: "Home",
};

/**
 * Wireframe 1f — home dashboard.
 *
 * Order is next trip, then quick actions, then cumulative impact: what is about
 * to happen outranks what you might do, which outranks what you have already
 * done. The pet is a badge in the nav rather than a card here, per the
 * wireframe's note.
 *
 * The four queries are issued with `Promise.all` rather than four sequential
 * awaits. Sequential awaits in a Server Component serialise the requests and
 * the page waits for the sum; these are independent, so it waits for the
 * slowest.
 */
export default async function HomePage() {
  // This page reads the clock — for the greeting, and to decide whether the next
  // trip is "tomorrow". Without `connection()` Next prerenders it at build time
  // and bakes that build's timestamp into the HTML, so the page would greet
  // every visitor with whatever time it was when the app was deployed.
  // `connection()` is the documented way to say "wait for a real request";
  // the old `export const dynamic` was removed in Next 16.
  await connection();

  const [user, nextTrip, impact, rewards] = await Promise.all([
    getCurrentUser(),
    getNextTrip(),
    getImpact(),
    getRewards(),
  ]);

  // Read once, here, and passed down. A component that calls `new Date()` during
  // render produces different output on the server and the client.
  const now = new Date();
  const firstName = user.fullName.split(" ")[0];
  const greeting = timeOfDayGreeting(now);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl sm:text-[32px]">
        {greeting}, {firstName}
      </h1>

      {nextTrip ? (
        <NextTripCard
          trip={nextTrip.trip}
          vehicle={nextTrip.vehicle}
          pickupPoint={nextTrip.pickupPoint}
          now={now}
        />
      ) : (
        <Callout tone="muted" className="text-sm">
          Nothing booked. Search a route and take a seat, or post a drive of your
          own.
        </Callout>
      )}

      {/*
        1.5fr / 1fr on the wireframe. Expressed as a 5-column grid at `lg` so
        the impact card gets 3 and the rail gets 2 — the same ratio without
        fractional column maths, and it collapses to one column below `lg`
        where a 190px rail would squeeze the chart.
      */}
      <div className="grid gap-4 lg:grid-cols-5">
        <ImpactCard impact={impact} className="lg:col-span-3" />

        <div className="flex flex-col gap-3 lg:col-span-2">
          <ButtonLink href={ROUTES.rides.href} variant="primary" size="lg" fullWidth>
            <Icon as={Search} size={15} />
            Find a ride
          </ButtonLink>
          <ButtonLink href={ROUTES.post.href} variant="secondary" size="lg" fullWidth>
            <Icon as={CarFront} size={15} />
            Post a drive
          </ButtonLink>
          <RewardsProgressCard rewards={rewards} />
        </div>
      </div>

      {impact.sharedTrips === 0 ? (
        <Callout tone="muted" className="text-sm">
          Take your first shared ride to start counting.
        </Callout>
      ) : null}
    </div>
  );
}
