import { Bus, Footprints, Train, TramFront } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Card, CardKicker, Icon } from "@/components/ui";
import { formatCo2, formatDuration, formatTransitMode } from "@/lib/format";
import type { TransitLeg, TransitMode } from "@/lib/types";

const MODE_ICONS: Record<TransitMode, LucideIcon> = {
  train: Train,
  bus: Bus,
  tram: TramFront,
  walk: Footprints,
};

/**
 * The transit route, broken out per leg.
 *
 * This is not decoration. Transit emissions are the sum over legs — a bus leg
 * emits twice what a train leg does per passenger-km and a tram leg emits
 * nothing — so the total on the comparison card is only auditable if the legs
 * that produced it are visible. `campus_routes.legs` is NULL for drive rows for
 * the same reason: a transit route cannot be costed without it.
 *
 * Rendered as an ordered list because the order is the route.
 */
export function TransitLegs({ legs }: { legs: TransitLeg[] }) {
  if (legs.length === 0) {
    return (
      <Card className="gap-1 p-4">
        <CardKicker>Transit legs</CardKicker>
        <p className="text-xs text-ink/65">
          No transit route cached for this pair yet.
        </p>
      </Card>
    );
  }

  return (
    <Card className="gap-2 p-4">
      <CardKicker>Transit legs</CardKicker>
      <ol className="flex list-none flex-col gap-2 p-0">
        {legs.map((leg, index) => (
          <li key={index} className="flex items-center gap-3 text-xs">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sand-200 text-ink/70">
              <Icon as={MODE_ICONS[leg.mode]} size={14} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="font-semibold">
                {formatTransitMode(leg.mode)}
                {leg.line ? ` ${leg.line}` : ""}
              </span>
              <span className="text-ink/55">
                {" "}
                · {leg.distanceKm.toFixed(1)} km ·{" "}
                {formatDuration(leg.durationMin)}
              </span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums">
              {formatCo2(leg.co2Kg)}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
