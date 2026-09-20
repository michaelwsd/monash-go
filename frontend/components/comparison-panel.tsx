"use client";

import { Bus, Footprints, TrainFront, TramFront } from "lucide-react";

import { Skeleton } from "@/components/status-blocks";
import { Card } from "@/components/ui/card";
import type { CompareMode, Comparison, ModeComparison, TransitLeg } from "@/lib/api";
import { formatDuration } from "@/lib/time";
import type { QueryState } from "@/lib/use-query";
import { cn } from "@/lib/utils";

const LABEL = "text-[10px] font-medium tracking-[0.04em] text-muted-foreground uppercase";

const MODE_NAME: Record<CompareMode, string> = {
  carpool: "This carpool",
  transit: "Public transport",
  private: "Driving alone",
};

/* Carpool and transit are per person; private is the whole car. Said inline
   so the three dollar figures are not read as like-for-like. */
const COST_NOTE: Record<CompareMode, string> = {
  carpool: "each",
  transit: "fare",
  private: "alone",
};

const LEG_ICON = {
  walk: Footprints,
  bus: Bus,
  train: TrainFront,
  tram: TramFront,
} as const;

/**
 * Requirement 4, on the ride page (artboard 1g): the same trip as a carpool
 * seat, by public transport, and driving alone.
 *
 * The ride page owns the fetch and hands the query in, because the booking
 * panel reads the same comparison for the seat's own figures - one request,
 * two readers.
 *
 * Degrades quietly. A 404 here also means "no fuel price on record yet", and
 * a comparison that cannot be shown must not stop a seat being booked.
 */
export function ComparisonPanel({ comparison }: { comparison: QueryState<Comparison> }) {
  // Only the first load shows a skeleton. A refetch after a booking keeps the
  // table on screen and dims it, so the numbers update in place rather than
  // the panel vanishing and reappearing.
  if (comparison.status === "loading" && !comparison.data) {
    return <Skeleton rows={1} lines={3} />;
  }

  if (comparison.status === "error" || !comparison.data) {
    return (
      <p className="px-1 text-xs text-muted-foreground">
        Comparison unavailable.{" "}
        <button
          type="button"
          onClick={comparison.reload}
          className="rounded font-medium text-foreground underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          Retry
        </button>
      </p>
    );
  }

  return <Table comparison={comparison.data} refreshing={comparison.status === "loading"} />;
}

function Table({ comparison, refreshing }: { comparison: Comparison; refreshing: boolean }) {
  const lowestCo2 = Math.min(...comparison.modes.map((m) => m.co2_kg));

  return (
    <Card
      className={cn(
        "gap-3.5 p-3.5 transition-opacity duration-300",
        refreshing && "opacity-60",
      )}
    >
      <p className={LABEL}>How this compares</p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {comparison.modes.map((row) => (
          <ModeCell key={row.mode} row={row} best={row.co2_kg === lowestCo2} />
        ))}
      </div>

      {comparison.transit_legs && comparison.transit_legs.length > 0 && (
        <Legs legs={comparison.transit_legs} />
      )}

      <Assumptions comparison={comparison} />

    </Card>
  );
}

function ModeCell({ row, best }: { row: ModeComparison; best: boolean }) {
  const carpool = row.mode === "carpool";

  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3 rounded-lg border px-3 py-2.5 sm:flex-col sm:items-stretch sm:gap-1",
        carpool ? "border-eco-border bg-eco-muted/40" : "border-border bg-background",
      )}
    >
      <p className="text-sm font-semibold">{MODE_NAME[row.mode]}</p>

      <div className="flex items-baseline gap-3 sm:mt-1 sm:flex-col sm:gap-0.5">
        {/* The big figure is CO2 - the product's whole argument. Lowest gets
            the one accent on the panel. */}
        <p
          className={cn(
            "text-xl font-semibold tracking-[-0.025em] tabular-nums",
            best && "text-eco-foreground",
          )}
        >
          {row.co2_kg.toFixed(2)}
          <span className="ml-1 text-xs font-normal text-muted-foreground">kg CO&#8322;</span>
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">
          ${row.cost.toFixed(2)} {COST_NOTE[row.mode]}
          <span aria-hidden> &middot; </span>
          {formatDuration(row.duration_min)}
        </p>
      </div>
    </div>
  );
}

function Legs({ legs }: { legs: TransitLeg[] }) {
  return (
    <div>
      <p className={cn(LABEL, "mb-1.5")}>Transit legs</p>
      <ol aria-label="Public transport journey">
        {legs.map((leg, i) => {
          const Icon = LEG_ICON[leg.mode];
          const last = i === legs.length - 1;
          return (
            /* One leg per row, joined by a rail. A row never wraps, so five
               legs read as five lines at any width instead of a ragged run of
               chips and arrows. */
            <li
              key={i}
              className={cn(
                "relative flex items-center gap-2.5 pb-2.5",
                !last &&
                  "before:absolute before:top-5 before:bottom-0 before:left-[9px] before:w-px before:bg-border",
              )}
            >
              <span className="relative z-10 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted">
                <Icon className="size-3 text-muted-foreground" aria-hidden />
              </span>
              <span className="min-w-0 flex-1 truncate text-xs font-medium capitalize">
                {leg.line ? `${leg.mode} ${leg.line}` : leg.mode}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {leg.distance_km.toFixed(1)} km &middot; {formatDuration(leg.duration_min)}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Assumptions({ comparison }: { comparison: Comparison }) {
  const parts = [
    `${comparison.riders} ${comparison.riders === 1 ? "rider" : "riders"}`,
    comparison.is_concession ? "concession myki" : "full-fare myki",
    comparison.fuel_price === null ? "electric" : `fuel $${comparison.fuel_price.toFixed(2)}/L`,
  ];
  return <p className="text-[11px] text-muted-foreground tabular-nums">{parts.join(" · ")}</p>;
}
