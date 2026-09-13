"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Car, Search } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { DateField } from "@/components/date-field";
import { SelectField } from "@/components/form-fields";
import { RideCard } from "@/components/ride-card";
import { EmptyState, ErrorState, Skeleton } from "@/components/status-blocks";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CAMPUS_OPTIONS, searchRides, type Campus } from "@/lib/api";
import { formatLongDate, todayMelbourne, toMelbourneInstant } from "@/lib/time";
import { useCurrentUser } from "@/lib/use-current-user";
import { useQuery } from "@/lib/use-query";

const CAMPUSES = new Set<string>(CAMPUS_OPTIONS.map((c) => c.value));

function isCampus(value: string | null): value is Campus {
  return value !== null && CAMPUSES.has(value);
}

/**
 * Find a ride. The search lives in the URL - /rides?origin=clayton&... - so a
 * result list survives a refresh, the back button, and being sent to a friend.
 *
 * useSearchParams has to sit under a Suspense boundary: without one, a static
 * page that calls it fails `next build`. See
 * node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md
 */
export default function FindRidePage() {
  return (
    <AppShell title="Find a ride">
      <Suspense fallback={<Skeleton rows={1} />}>
        <FindRide />
      </Suspense>
    </AppShell>
  );
}

function FindRide() {
  const router = useRouter();
  const params = useSearchParams();
  const { user } = useCurrentUser();

  const rawOrigin = params.get("origin");
  const rawDestination = params.get("destination");
  const query = {
    origin: isCampus(rawOrigin) ? rawOrigin : null,
    destination: isCampus(rawDestination) ? rawDestination : null,
    on: params.get("on"),
  };

  return (
    <div className="flex flex-col gap-3.5">
      <SearchForm
        // Remount when the URL changes, so the fields always show what was
        // searched rather than a draft from before the back button.
        key={params.toString()}
        initial={{
          origin: query.origin ?? user?.home_campus ?? "",
          destination: query.destination ?? "",
          on: query.on ?? todayMelbourne(),
        }}
        onSearch={(next) => router.replace(`/rides?${new URLSearchParams({ ...next }).toString()}`)}
      />

      {query.origin && query.destination && query.on ? (
        <Results origin={query.origin} destination={query.destination} on={query.on} />
      ) : (
        <p className="px-1 text-xs text-muted-foreground">
          Pick a route and a day to see who&apos;s driving.
        </p>
      )}
    </div>
  );
}

interface Draft {
  origin: Campus | "";
  destination: Campus | "";
  on: string;
}

function SearchForm({
  initial,
  onSearch,
}: {
  initial: Draft;
  onSearch: (query: Draft) => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const sameCampus = draft.origin !== "" && draft.origin === draft.destination;
  const ready = draft.origin !== "" && draft.destination !== "" && draft.on !== "" && !sameCampus;

  return (
    <Card className="gap-3 p-3.5">
      <form
        className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_12.5rem_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) onSearch(draft);
        }}
      >
        <SelectField
          label="From"
          placeholder="Campus"
          options={CAMPUS_OPTIONS}
          value={draft.origin}
          onValueChange={(v) => setDraft({ ...draft, origin: v as Campus })}
        />
        <SelectField
          label="To"
          placeholder="Campus"
          options={CAMPUS_OPTIONS}
          value={draft.destination}
          onValueChange={(v) => setDraft({ ...draft, destination: v as Campus })}
        />
        <DateField
          label="Date"
          min={todayMelbourne()}
          value={draft.on}
          onChange={(on) => setDraft({ ...draft, on })}
        />
        <Button type="submit" size="lg" className="h-[42px] w-full sm:w-auto" disabled={!ready}>
          <Search aria-hidden />
          Search
        </Button>
      </form>
      {sameCampus && (
        <p className="text-xs text-destructive">Pick two different campuses.</p>
      )}
    </Card>
  );
}

function Results({ origin, destination, on }: { origin: Campus; destination: Campus; on: string }) {
  const rides = useQuery(
    (token) => searchRides({ origin, destination, on }, { token }),
    [origin, destination, on],
  );

  if (rides.status === "loading") return <Skeleton rows={3} />;
  if (rides.status === "error" || rides.data === null) {
    return <ErrorState message="Couldn't load rides." onRetry={rides.reload} />;
  }

  // The API answers in Melbourne-day terms; naming the day back confirms which
  // one was searched, since the date field alone is easy to misread.
  const day = formatLongDate(toMelbourneInstant(on, "12:00"));

  if (rides.data.length === 0) {
    return (
      <EmptyState
        icon={Car}
        title={`No rides on ${day}`}
        body="Nobody's posted this route yet. Driving it yourself?"
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

  return (
    <section className="flex flex-col gap-2.5">
      <p className="px-1 text-xs text-muted-foreground">
        {rides.data.length} {rides.data.length === 1 ? "ride" : "rides"} &middot; {day}
      </p>
      {rides.data.map((ride) => (
        <RideCard key={ride.id} ride={ride} />
      ))}
    </section>
  );
}
