import { formatCampus, formatDuration } from "@/lib/format";
import type { Campus } from "@/lib/types";

interface RouteStripProps {
  origin: Campus;
  destination: Campus;
  distanceKm: number;
  durationMin: number;
  pickupPoint: string | null;
}

/**
 * A schematic of the planned route.
 *
 * The wireframe reserves a "planned route map placeholder" here. Rather than
 * ship a grey rectangle, or an embedded Google map that costs an API call and a
 * key on every ride view, this draws the only information the map would have
 * carried at this size: two endpoints, the pick-up in between, and how far and
 * how long.
 *
 * The dashed connector is the design system's own way of saying "planned" — the
 * same notation the sign-in illustration uses, and it matches the promise on the
 * profile screen that MonashGo never tracks anyone's location.
 */
export function RouteStrip({
  origin,
  destination,
  distanceKm,
  durationMin,
  pickupPoint,
}: RouteStripProps) {
  return (
    <div className="rounded-card bg-sand-100 p-4">
      <div className="flex items-center gap-3">
        <span aria-hidden className="size-3 shrink-0 rounded-full bg-sage-700" />

        <span
          aria-hidden
          className="h-0 flex-1 border-t-2 border-dashed border-ink/25"
        />

        <span className="shrink-0 rounded-full bg-surface px-3 py-1 text-xs font-semibold whitespace-nowrap">
          {distanceKm.toFixed(1)} km · {formatDuration(durationMin)}
        </span>

        <span
          aria-hidden
          className="h-0 flex-1 border-t-2 border-dashed border-ink/25"
        />

        <span aria-hidden className="size-3 shrink-0 rounded-full bg-clay-700" />
      </div>

      <div className="mt-2 flex items-start justify-between gap-4 text-xs">
        <span className="font-semibold">{formatCampus(origin)}</span>
        <span className="font-semibold">{formatCampus(destination)}</span>
      </div>

      {pickupPoint ? (
        <p className="mt-2 text-xs text-ink/65">Pick-up at {pickupPoint}</p>
      ) : null}
    </div>
  );
}
