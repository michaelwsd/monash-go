"use client";

import type { ComponentType, ReactNode } from "react";
import { Car, ExternalLink, TrainFront } from "lucide-react";

import { ComparisonUnavailable, LABEL, ModeGrid, TransitLegs } from "@/components/comparison-panel";
import { Skeleton } from "@/components/status-blocks";
import { Card } from "@/components/ui/card";
import { campusLabel, googleMapsDirections, type CompareMode, type RouteEstimate } from "@/lib/api";
import { formatDuration } from "@/lib/time";
import type { QueryState } from "@/lib/use-query";

/* No ride, so no "this" carpool: the cell is a generic seat in a typical car. */
const MODE_NAME: Record<CompareMode, string> = {
  carpool: "Carpool",
  transit: "Public transport",
  private: "Driving alone",
};

/**
 * Requirement 4 before anyone has posted the route: the search page's answer
 * to "what would this trip cost?" when the answer to "who is driving?" is
 * nobody, or not yet.
 *
 * The figures are the backend's GET /compare/route - the same maths as a
 * ride's comparison, priced with the fleet-average petrol car and one
 * passenger in place of a real driver's car. They are labelled as an estimate
 * and the assumptions are printed under them, so nobody mistakes them for a
 * quote.
 *
 * Degrades quietly, like the ride page's panel: a missing comparison must
 * never get in the way of the search results above it.
 */
export function RouteEstimatePanel({ estimate }: { estimate: QueryState<RouteEstimate> }) {
  if (estimate.status === "loading") return <Skeleton rows={1} lines={3} />;
  if (estimate.status === "error" || !estimate.data) {
    return <ComparisonUnavailable onRetry={estimate.reload} />;
  }

  const route = estimate.data;

  return (
    <Card className="gap-3.5 p-3.5">
      <div>
        <p className={LABEL}>Rough estimate</p>
        <p className="mt-0.5 text-sm font-semibold">
          {campusLabel(route.origin)} &rarr; {campusLabel(route.destination)}, three ways
        </p>
      </div>

      <ModeGrid modes={route.modes} names={MODE_NAME} />

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:items-start">
        <RouteBlock
          icon={Car}
          title="Driving"
          href={googleMapsDirections(route.origin, route.destination, "driving")}
        >
          <p className="text-xs text-muted-foreground tabular-nums">
            {route.distance_km.toFixed(1)} km
            {route.drive_summary && <> via {route.drive_summary}</>}
            <span aria-hidden> &middot; </span>
            {formatDuration(duration(route, "private"))}
          </p>
        </RouteBlock>

        <RouteBlock
          icon={TrainFront}
          title="Public transport"
          href={googleMapsDirections(route.origin, route.destination, "transit")}
        >
          {route.transit_legs && route.transit_legs.length > 0 ? (
            <TransitLegs legs={route.transit_legs} />
          ) : (
            <p className="text-xs text-muted-foreground">
              {formatDuration(duration(route, "transit"))}
            </p>
          )}
        </RouteBlock>
      </div>

      <Assumptions route={route} />
    </Card>
  );
}

function duration(route: RouteEstimate, mode: CompareMode): number {
  return route.modes.find((m) => m.mode === mode)?.duration_min ?? 0;
}

/**
 * One way of making the trip, with the journey Google planned and a link to
 * open the same plan in Google Maps. Each block is as tall as its own content:
 * a one-line drive stretched to match five transit legs is mostly empty box.
 */
function RouteBlock({
  icon: Icon,
  title,
  href,
  children,
}: {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  href: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border bg-background px-3 py-2.5">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <Icon className="size-3.5 text-muted-foreground" aria-hidden />
        {title}
      </h3>
      {children}
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex w-fit items-center gap-1 rounded text-xs font-medium underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        Open in Google Maps
        <ExternalLink className="size-3" aria-hidden />
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    </section>
  );
}

function Assumptions({ route }: { route: RouteEstimate }) {
  const parts = [
    `typical petrol car, ${route.fuel_consumption} L/100km`,
    `${route.riders} ${route.riders === 1 ? "passenger" : "passengers"}`,
    route.is_concession ? "concession myki" : "full-fare myki",
    // always petrol here, so always priced; the type allows null for an EV ride
    route.fuel_price !== null && `fuel $${route.fuel_price.toFixed(2)}/L`,
  ].filter(Boolean);
  return (
    <p className="text-[11px] text-muted-foreground tabular-nums first-letter:uppercase">
      {parts.join(" · ")}
    </p>
  );
}
