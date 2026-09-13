import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { campusLabel, type Ride } from "@/lib/api";
import { formatDay, formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";

const LABEL = "text-[10px] font-medium tracking-[0.04em] text-muted-foreground uppercase";

/**
 * One ride in a list, following the card from artboard 1a. The whole card is
 * the link; the driver and car are on the detail page, since search returns
 * only their ids.
 */
export function RideCard({ ride, showDay = false }: { ride: Ride; showDay?: boolean }) {
  const full = ride.available_seats === 0;

  return (
    <Link
      href={`/rides/${ride.id}`}
      className="group rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <Card
        className={cn(
          "flex-row items-center gap-3 p-3 transition-colors group-hover:bg-muted/60",
          full && "opacity-60",
        )}
      >
        <div className="min-w-[56px] text-center">
          <p className="text-lg font-semibold tracking-[-0.025em] tabular-nums">
            {formatTime(ride.departure_at)}
          </p>
          <p className={LABEL}>{showDay ? formatDay(ride.departure_at) : `${ride.distance_km.toFixed(0)} km`}</p>
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">
            {campusLabel(ride.origin)} &rarr; {campusLabel(ride.destination)}
          </p>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground tabular-nums">
            {showDay && <span>{ride.distance_km.toFixed(0)} km &middot; </span>}
            {full
              ? "Full"
              : `${ride.available_seats} of ${ride.total_seats} seat${ride.total_seats === 1 ? "" : "s"} left`}
          </p>
        </div>

        {!full && (
          <Badge variant="outline" className="hidden rounded-full font-medium sm:inline-flex">
            {ride.available_seats} left
          </Badge>
        )}
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Card>
    </Link>
  );
}
