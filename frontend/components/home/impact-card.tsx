import { Card, CardKicker, Stat } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatCo2, formatMoneyWhole } from "@/lib/format";
import type { ImpactSummary } from "@/lib/types";

import { WeeklyCo2Chart } from "./weekly-co2-chart";

/**
 * Cumulative impact: three headline numbers over an eight-week chart.
 *
 * CO2 is sage because it went down; the other two are ink. Colouring all three
 * green would spend the site's one meaningful colour on "18", which is a count
 * of trips and carries no environmental direction.
 */
export function ImpactCard({
  impact,
  className,
}: {
  impact: ImpactSummary;
  className?: string;
}) {
  return (
    <Card elevation="sm" className={cn("gap-4 p-4", className)}>
      <CardKicker>Your impact</CardKicker>

      <div className="flex flex-wrap gap-x-8 gap-y-4">
        <Stat
          value={formatCo2(impact.co2AvoidedKg)}
          label="CO₂ avoided"
          tone="sage"
        />
        <Stat value={impact.sharedTrips} label="shared trips" />
        <Stat value={formatMoneyWhole(impact.moneySavedAud)} label="saved" />
      </div>

      <WeeklyCo2Chart weeks={impact.weeklyCo2Kg} className="mt-1" />
    </Card>
  );
}
