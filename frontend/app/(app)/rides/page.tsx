import type { Metadata } from "next";

import { RideCard } from "@/components/rides/ride-card";
import { RideFilters } from "@/components/rides/ride-filters";
import { SortChips } from "@/components/rides/sort-chips";
import { ButtonLink, Callout, GhostPanel } from "@/components/ui";
import { searchRides } from "@/lib/data/queries";
import { formatCampus, formatDay } from "@/lib/format";
import {
  parseRideSearch,
  toFilters,
  type RawSearchParams,
} from "@/lib/ride-search-params";

export const metadata: Metadata = {
  title: "Find a ride",
};

/**
 * Wireframes 1a and 1d — search and browse.
 *
 * Direction 1a (filter rail + ranked list) is the one built, with 1d as its
 * phone layout — the wireframes describe 1d as "the same data as 1a at phone
 * width", so they are one screen at two widths rather than two designs. 1b's
 * timetable spine and 1c's compare-first table were the alternatives; 1a scales
 * to a long list best, which is the case that matters once the app has users.
 *
 * A Server Component. It reads the URL, queries, and renders HTML — there is no
 * loading spinner because there is no client fetch. The only JavaScript on the
 * page is the mobile filter sheet's disclosure toggle.
 */
export default async function RidesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const state = parseRideSearch(await searchParams);
  const results = await searchRides(toFilters(state));

  const bookable = results.filter((result) => result.ride.availableSeats > 0).length;

  return (
    <div className="grid gap-4 lg:grid-cols-[224px_1fr] lg:gap-6">
      <aside>
        <RideFilters state={state} />
      </aside>

      <section className="min-w-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl sm:text-2xl">
            {results.length} {results.length === 1 ? "ride" : "rides"} ·{" "}
            {formatCampus(state.origin)} → {formatCampus(state.destination)}
          </h1>
          <SortChips state={state} />
        </div>

        <p className="mt-1 text-sm text-ink/65">
          {formatDay(`${state.date}T00:00:00+10:00`)}
          {state.minSeats > 1 ? ` · ${state.minSeats}+ seats` : ""}
          {state.fuelTypes.length > 0 ? ` · ${state.fuelTypes.join(", ")}` : ""}
        </p>

        {results.length > 0 ? (
          <ul
            // Announced when a sort or filter replaces the list, since the
            // heading above is the only other thing that changes.
            aria-live="polite"
            className="mt-4 flex list-none flex-col gap-3 p-0"
          >
            {results.map((summary) => (
              <RideCard key={summary.ride.id} summary={summary} />
            ))}
          </ul>
        ) : (
          <GhostPanel className="mt-4 flex flex-col items-start gap-3 p-5">
            <p className="text-sm">
              No rides on this route yet. Try a wider time, or drive it yourself
              and let others join.
            </p>
            <ButtonLink href="/post" variant="primary" size="lg">
              Post a drive
            </ButtonLink>
          </GhostPanel>
        )}

        {results.length > 0 && bookable === 0 ? (
          <Callout tone="muted" className="mt-3">
            Every ride on this route is full. Posting your own is the fastest way
            to travel — drivers on this route get notified when someone does.
          </Callout>
        ) : null}
      </section>
    </div>
  );
}
