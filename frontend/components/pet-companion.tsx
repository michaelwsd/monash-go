"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { Pet } from "@/components/pet";
import { Card } from "@/components/ui/card";
import type { RewardsSummary } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * The pet on the dashboard, with something to say.
 *
 * Every line is built from the user's own figures, so it is a status readout
 * wearing a speech bubble rather than a fortune cookie: how far off the next
 * stage is, what is bookable with the points on hand, whether a ride is coming
 * up. A pet that said the same encouraging nothing to everybody would be worth
 * less than the space it takes.
 *
 * Lines rotate rather than stacking, because the dashboard's job is the next
 * trip and the two buttons, and a paragraph of pet chatter would compete with
 * them.
 */

const EVERY_MS = 7000;

export function PetCompanion({
  summary,
  equipped,
  upcoming,
  cheapestUnowned,
}: {
  summary: RewardsSummary;
  /** image_url of each worn accessory, so the dashboard pet is theirs. */
  equipped: string[];
  /** Confirmed bookings still ahead. */
  upcoming: number;
  /** Points needed for the cheapest thing they can buy but have not. */
  cheapestUnowned: number | null;
}) {
  const lines = useMemo(
    () => buildLines({ summary, upcoming, cheapestUnowned }),
    [summary, upcoming, cheapestUnowned],
  );

  // A counter, with the line derived from it during render. Resetting an index
  // in an effect when `lines` changes would be a synchronous setState inside an
  // effect, which React 19 rejects as a cascading render; taking it modulo the
  // current length keeps it in range for free, however the set changes.
  const [tick, setTick] = useState(0);
  const [paused, setPaused] = useState(false);
  const line = lines[tick % lines.length];

  useEffect(() => {
    if (paused || lines.length < 2) return;
    const id = setInterval(() => setTick((t) => t + 1), EVERY_MS);
    return () => clearInterval(id);
  }, [paused, lines.length]);

  return (
    <Card
      className="gap-0 p-0"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <Link
        href="/rewards"
        // Pausing on focus as well as hover: a line swapping under someone
        // reading it with a keyboard is the same problem as under a cursor.
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
        className="flex items-center gap-3 rounded-xl p-3.5 transition-colors hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <div className="flex size-20 shrink-0 items-center justify-center rounded-lg border border-eco-border bg-eco-muted/50">
          <Pet
            stage={summary.pet_stage}
            equipped={equipped}
            className="size-[4.5rem]"
          />
        </div>

        <div className="min-w-0 flex-1">
          <Bubble>{line}</Bubble>
        </div>
      </Link>
    </Card>
  );
}

/**
 * A speech bubble with a tail pointing back at the pet.
 *
 * The tail is a rotated square rather than a border triangle so it inherits
 * the bubble's own background and border and cannot drift out of step with
 * the theme.
 */
function Bubble({ children }: { children: string }) {
  return (
    <div className="relative">
      <span
        aria-hidden
        className="absolute top-1/2 -left-[5px] size-2.5 -translate-y-1/2 rotate-45 border-b border-l border-border bg-card"
      />
      <p
        // aria-live so a screen reader hears the line change instead of
        // silently showing a new one.
        aria-live="polite"
        className={cn(
          "relative rounded-lg border bg-card px-3 py-2 text-[13px] leading-snug text-pretty",
          // The crossfade is the only motion; under reduced-motion the line
          // simply swaps.
          "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500",
        )}
        key={children}
      >
        {children}
      </p>
    </div>
  );
}

const STAGE_BRAG: Record<RewardsSummary["pet_stage"], string> = {
  egg: "Still in the shell.",
  hatched: "Out of the shell, thanks to you.",
  juvenile: "Growing, slowly.",
  adult: "Fully grown. Not stopping.",
  legendary: "There is nothing above this.",
};

function buildLines({
  summary,
  upcoming,
  cheapestUnowned,
}: {
  summary: RewardsSummary;
  upcoming: number;
  cheapestUnowned: number | null;
}): string[] {
  const {
    completed_trips,
    total_co2_saved,
    green_points,
    co2_to_next,
    next_stage,
  } = summary;

  // Nothing completed is a different situation, not a thinner version of the
  // same one: there are no figures to talk about, so the lines explain how any
  // of this starts instead.
  if (completed_trips === 0) {
    return [
      "Nothing hatched yet. Share a ride and I get going.",
      "I grow on the CO₂ your carpools save. No rides, no growth.",
      "Book a seat, or post a drive if you are the one with the car.",
      "A driver has to mark the trip complete before anything counts.",
    ];
  }

  const lines = [
    `${total_co2_saved.toFixed(1)} kg kept out of the air so far.`,
    `${completed_trips} ${completed_trips === 1 ? "trip" : "trips"} done. That is what got me here.`,
  ];

  if (next_stage && co2_to_next !== null) {
    lines.push(
      co2_to_next < 3
        ? `${co2_to_next.toFixed(1)} kg off ${next_stage}. One more ride, probably.`
        : `${co2_to_next.toFixed(1)} kg more and I am ${next_stage}.`,
    );
  } else {
    lines.push(STAGE_BRAG.legendary);
  }

  if (upcoming > 0) {
    lines.push(
      upcoming === 1
        ? "You have a ride coming up."
        : `${upcoming} rides coming up.`,
    );
  }

  if (cheapestUnowned !== null) {
    lines.push(
      green_points >= cheapestUnowned
        ? `${green_points.toLocaleString()} points. Something in the shop fits.`
        : `${(cheapestUnowned - green_points).toLocaleString()} points off the next thing I could wear.`,
    );
  }

  lines.push(STAGE_BRAG[summary.pet_stage]);
  return lines;
}
