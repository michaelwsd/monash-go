import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import {
  TripFilters,
  type TripFilterState,
  type TripRole,
  type TripTab,
} from "@/components/trips/trip-filters";
import { TripRow } from "@/components/trips/trip-row";
import { ButtonLink, Callout, GhostPanel } from "@/components/ui";
import { getMyTrips } from "@/lib/data/queries";
import type { Trip } from "@/lib/types";
import type { RawSearchParams } from "@/lib/ride-search-params";

export const metadata: Metadata = {
  title: "My trips",
};

const TABS: TripTab[] = ["upcoming", "past"];
const ROLES: TripRole[] = ["all", "driver", "passenger"];

function parseFilters(params: RawSearchParams): TripFilterState {
  const tab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const role = Array.isArray(params.role) ? params.role[0] : params.role;

  return {
    tab: TABS.includes(tab as TripTab) ? (tab as TripTab) : "upcoming",
    role: ROLES.includes(role as TripRole) ? (role as TripRole) : "all",
  };
}

/** Upcoming means the ride can still be travelled; everything else is history. */
function isUpcoming(trip: Trip): boolean {
  return trip.ride.status === "open" || trip.ride.status === "full";
}

/**
 * Wireframe 1j — my trips.
 *
 * One list across both roles, split by filters rather than by page, because the
 * question a user arrives with is "what am I doing on Monday" and the answer does
 * not care whether they are driving or riding.
 *
 * Rides awaiting completion are surfaced above the list rather than left to be
 * found. That transition is the only thing that awards points, so a driver who
 * never notices it never gets credited — a quiet row in a list is not enough.
 */
export default async function TripsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const state = parseFilters(await searchParams);
  const allTrips = await getMyTrips();

  const trips = allTrips
    .filter((trip) => (state.tab === "upcoming" ? isUpcoming(trip) : !isUpcoming(trip)))
    .filter((trip) => state.role === "all" || trip.role === state.role);

  const awaiting = allTrips.filter(
    (trip) => trip.role === "driver" && trip.ride.status === "in_progress",
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="My trips"
        subtitle="Everything you are driving or riding, in one list."
      />

      {awaiting.length > 0 && state.tab === "upcoming" ? (
        <Callout tone="warning">
          {awaiting.length === 1
            ? "One finished drive is waiting to be marked complete."
            : `${awaiting.length} finished drives are waiting to be marked complete.`}{" "}
          Points are only awarded on that transition — check the Past tab.
        </Callout>
      ) : null}

      <TripFilters state={state} />

      {trips.length > 0 ? (
        <ul className="flex list-none flex-col gap-3 p-0">
          {trips.map((trip) => (
            <TripRow key={`${trip.role}-${trip.id}`} trip={trip} />
          ))}
        </ul>
      ) : (
        <GhostPanel className="flex flex-col items-start gap-3 p-5">
          <p className="m-0 text-sm">
            {state.tab === "upcoming"
              ? "Nothing coming up. Find a ride, or offer the seats in your own car."
              : "No finished trips yet. Your first completed ride starts the count."}
          </p>
          {state.tab === "upcoming" ? (
            <div className="flex flex-wrap gap-2">
              <ButtonLink href="/rides" variant="primary" size="lg">
                Find a ride
              </ButtonLink>
              <ButtonLink href="/post" variant="secondary" size="lg">
                Post a drive
              </ButtonLink>
            </div>
          ) : null}
        </GhostPanel>
      )}

      <Callout tone="note">
        Costs are estimates for splitting between riders. MonashGo does not take
        or move money.
      </Callout>
    </div>
  );
}
