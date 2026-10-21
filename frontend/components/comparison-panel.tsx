"use client";

import { Fragment, type ReactNode } from "react";
import { Bus, Footprints, TrainFront, TramFront } from "lucide-react";

import { Skeleton } from "@/components/status-blocks";
import { Card } from "@/components/ui/card";
import {
  campusLabel,
  type Campus,
  type CompareMode,
  type Comparison,
  type ModeComparison,
  type TransitLeg,
} from "@/lib/api";
import { formatDuration } from "@/lib/time";
import type { QueryState } from "@/lib/use-query";
import { cn } from "@/lib/utils";

export const LABEL = "text-[10px] font-medium tracking-[0.04em] text-muted-foreground uppercase";

export const MODE_NAME: Record<CompareMode, string> = {
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
export function ComparisonPanel({
  comparison,
  origin,
  destination,
}: {
  comparison: QueryState<Comparison>;
  origin: Campus;
  destination: Campus;
}) {
  // Only the first load shows a skeleton. A refetch after a booking keeps the
  // table on screen and dims it, so the numbers update in place rather than
  // the panel vanishing and reappearing.
  if (comparison.status === "loading" && !comparison.data) {
    return <Skeleton rows={1} lines={3} />;
  }

  if (comparison.status === "error" || !comparison.data) {
    return <ComparisonUnavailable onRetry={comparison.reload} />;
  }

  return (
    <Table
      comparison={comparison.data}
      origin={origin}
      destination={destination}
      refreshing={comparison.status === "loading"}
    />
  );
}

/** A comparison that cannot be shown says so in one quiet line, never a red card. */
export function ComparisonUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <p className="px-1 text-xs text-muted-foreground">
      Comparison unavailable.{" "}
      <button
        type="button"
        onClick={onRetry}
        className="rounded font-medium text-foreground underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        Retry
      </button>
    </p>
  );
}

function Table({
  comparison,
  origin,
  destination,
  refreshing,
}: {
  comparison: Comparison;
  origin: Campus;
  destination: Campus;
  refreshing: boolean;
}) {
  return (
    <Card
      className={cn(
        "gap-3.5 p-3.5 transition-opacity duration-300",
        refreshing && "opacity-60",
      )}
    >
      <p className={LABEL}>How this compares</p>

      <ModeGrid modes={comparison.modes} />

      {comparison.transit_legs && comparison.transit_legs.length > 0 && (
        <div>
          <p className={cn(LABEL, "mb-1.5")}>Public transport route</p>
          <TransitLegs legs={comparison.transit_legs} origin={origin} destination={destination} />
        </div>
      )}

      <Assumptions comparison={comparison} />

    </Card>
  );
}

/** The three modes side by side; the lowest CO2 gets the panel's one accent. */
export function ModeGrid({
  modes,
  names = MODE_NAME,
}: {
  modes: ModeComparison[];
  names?: Record<CompareMode, string>;
}) {
  const lowestCo2 = Math.min(...modes.map((m) => m.co2_kg));

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {modes.map((row) => (
        <ModeCell key={row.mode} row={row} name={names[row.mode]} best={row.co2_kg === lowestCo2} />
      ))}
    </div>
  );
}

function ModeCell({ row, name, best }: { row: ModeComparison; name: string; best: boolean }) {
  const carpool = row.mode === "carpool";

  return (
    <div
      className={cn(
        /* Phone: two lines, name and CO2 on the first, cost and time under
           the name, so no figure ever breaks mid-unit. From sm: a column. */
        "grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-0.5 rounded-lg border px-3 py-2.5 sm:flex sm:flex-col sm:items-stretch sm:gap-1",
        carpool ? "border-eco-border bg-eco-muted/40" : "border-border bg-background",
      )}
    >
      <p className="text-sm font-semibold">{name}</p>

      <div className="contents sm:mt-1 sm:flex sm:flex-col sm:gap-0.5">
        {/* The big figure is CO2 - the product's whole argument. Lowest gets
            the one accent on the panel. */}
        <p
          className={cn(
            "text-xl font-semibold tracking-[-0.025em] whitespace-nowrap tabular-nums",
            best && "text-eco-foreground",
          )}
        >
          {row.co2_kg.toFixed(2)}
          <span className="ml-1 text-xs font-normal text-muted-foreground">kg CO&#8322;</span>
        </p>
        <p className="col-span-2 text-xs text-muted-foreground tabular-nums">
          ${row.cost.toFixed(2)} {COST_NOTE[row.mode]}
          <span aria-hidden> &middot; </span>
          {formatDuration(row.duration_min)}
        </p>
      </div>
    </div>
  );
}

/**
 * The public transport journey as a timeline: the origin campus, each leg,
 * the destination campus. The two ends are named because the legs alone
 * ("Walk, Bus 783, Walk...") never say where the trip starts or finishes.
 */
export function TransitLegs({
  legs,
  origin,
  destination,
}: {
  legs: TransitLeg[];
  origin: Campus;
  destination: Campus;
}) {
  return (
    <ol aria-label="Public transport journey">
      <Stop campus={origin} note="Start" />
      {legs.map((leg, i) => {
        const Icon = LEG_ICON[leg.mode];
        const walk = leg.mode === "walk";
        return (
          <TimelineRow
            key={i}
            marker={<Icon className="size-3 text-muted-foreground" aria-hidden />}
            label={
              <span className={cn("capitalize", walk ? "text-muted-foreground" : "font-medium")}>
                {leg.mode}
                {leg.line && (
                  <span className="font-normal text-muted-foreground normal-case">
                    {" "}
                    &middot; {lineName(leg)}
                  </span>
                )}
              </span>
            }
            detail={`${leg.distance_km.toFixed(1)} km · ${formatDuration(leg.duration_min)}`}
          />
        );
      })}
      <Stop campus={destination} note="Arrive" last />
    </ol>
  );
}

/* Google names a train by its line ("Frankston") and a bus or tram by its
   route number ("783"). "Train · Frankston" reads like a destination. */
function lineName(leg: TransitLeg): string {
  return leg.mode === "train" ? `${leg.line} line` : `Route ${leg.line}`;
}

/** A campus at either end of the journey: a ring for the start, a dot for the end. */
function Stop({ campus, note, last = false }: { campus: Campus; note: string; last?: boolean }) {
  return (
    <TimelineRow
      last={last}
      marker={
        <span
          className={cn(
            "size-2.5 rounded-full border-2 border-foreground",
            last ? "bg-foreground" : "bg-background",
          )}
        />
      }
      label={<span className="font-semibold">{campusLabel(campus)} campus</span>}
      detail={note}
    />
  );
}

/* One row per stop or leg, joined by a rail. A row never wraps, so a long
   journey reads as one line per step at any width. */
function TimelineRow({
  marker,
  label,
  detail,
  last = false,
}: {
  marker: ReactNode;
  label: ReactNode;
  detail: string;
  last?: boolean;
}) {
  return (
    <li
      className={cn(
        "relative flex items-center gap-2.5",
        !last &&
          "pb-2.5 before:absolute before:top-5 before:bottom-0 before:left-[9px] before:w-px before:bg-border",
      )}
    >
      <span className="relative z-10 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted">
        {marker}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs">{label}</span>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{detail}</span>
    </li>
  );
}

function Assumptions({ comparison }: { comparison: Comparison }) {
  const parts = [
    `${comparison.riders} ${comparison.riders === 1 ? "rider" : "riders"}`,
    comparison.is_concession ? "concession myki" : "full-fare myki",
    comparison.fuel_price === null ? "electric" : `fuel $${comparison.fuel_price.toFixed(2)}/L`,
  ];
  // Each part stays whole, so a narrow screen wraps between parts, never
  // inside "fuel $2.40/L".
  return (
    <p className="text-[11px] text-muted-foreground tabular-nums">
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && " · "}
          <span className="whitespace-nowrap">{part}</span>
        </Fragment>
      ))}
    </p>
  );
}
