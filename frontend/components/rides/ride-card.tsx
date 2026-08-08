import Link from "next/link";

import { Avatar, ButtonLink, Card, Tag } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  formatCampus,
  formatCo2,
  formatDuration,
  formatMoney,
  formatTime,
  formatVehicle,
} from "@/lib/format";
import type { RideSummary } from "@/lib/types";

/**
 * One search result.
 *
 * The layout is 1a's row on wide screens and 1d's stacked card on a phone, from
 * one component rather than two. Two components would be two places to fix a
 * wrong CO2 figure, and the wireframes are explicit that this is "the same data
 * as 1a at phone width".
 *
 * The whole card is a link to the ride, with the Book button layered on top as a
 * separate target. That gives a big, forgiving tap area on a phone without
 * nesting one interactive element inside another — the card's link is a
 * stretched pseudo-element, and the button sits above it on the z-axis.
 */
export function RideCard({ summary }: { summary: RideSummary }) {
  const { ride, driver, vehicle, durationMin } = summary;
  const isFull = ride.availableSeats === 0;

  return (
    <Card
      as="li"
      elevation="sm"
      className={cn(
        "relative isolate gap-0 p-4 transition-shadow duration-150",
        isFull ? "opacity-60" : "hover:shadow-md",
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        {/* Departure time. The display face and the largest thing on the card,
            because it is the field people scan a list of rides by. */}
        <div className="flex items-baseline gap-2 sm:min-w-14 sm:flex-col sm:items-center sm:gap-0">
          <span className="font-display text-xl leading-none">
            {formatTime(ride.departureAt)}
          </span>
          <span className="label">{formatDuration(durationMin)}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Avatar name={driver.displayName} src={driver.avatarUrl} size="sm" />
            <p className="truncate text-sm font-semibold">
              {driver.displayName} · {formatVehicle(vehicle)}
            </p>
          </div>

          <p className="mt-1 text-xs text-ink/65">
            {summary.pickupPoint ?? formatCampus(ride.origin)} →{" "}
            {formatCampus(ride.destination)}
            {isFull
              ? " · Full"
              : ` · ${ride.availableSeats} of ${ride.totalSeats} seats left`}
          </p>

          {!isFull ? (
            <ul className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <li className="font-semibold text-sage-700">
                {formatCo2(summary.co2PerPersonKg)} CO₂ each
              </li>
              <li>{formatMoney(summary.costPerPersonAud)}</li>
              <li className="text-ink/55">
                saves {formatCo2(summary.co2AvoidedKg)} vs solo
              </li>
            </ul>
          ) : null}
        </div>

        <div className="shrink-0 sm:self-center">
          {isFull ? (
            // No waitlist endpoint exists, so this is a state rather than a
            // dead button. See the gap list.
            <Tag tone="neutral">Full</Tag>
          ) : (
            <ButtonLink
              href={`/rides/${ride.id}`}
              variant="sage"
              size="lg"
              fullWidth
              className="relative z-10 sm:w-auto"
            >
              Book
            </ButtonLink>
          )}
        </div>
      </div>

      {/* The card-wide target. `sr-only` text rather than a visible label, since
          the visible content above already says all of it. */}
      <Link
        href={`/rides/${ride.id}`}
        className="absolute inset-0 rounded-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay"
      >
        <span className="sr-only">
          View {driver.displayName}&rsquo;s {formatTime(ride.departureAt)} ride to{" "}
          {formatCampus(ride.destination)}
        </span>
      </Link>
    </Card>
  );
}
