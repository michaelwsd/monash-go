import { Card, CardKicker, Tag } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatCo2, formatDuration, formatMoney } from "@/lib/format";
import type { CompareOption } from "@/lib/types";

/**
 * The three-mode comparison: carpool vs public transport vs driving solo.
 *
 * Colour decisions, which went one way and then had to be reversed:
 *
 * The obvious move is a hue per mode — sage carpool, neutral transit, clay solo.
 * Measured, it fails: sage-600 and sand-600 are only ΔE 4.9 apart in OKLab,
 * which is below the threshold at which a reader with full colour vision can
 * tell them apart, let alone one with deuteranopia (ΔE 2.5). Three legible hues
 * do not exist in a deliberately warm, low-chroma palette.
 *
 * That failure is also a diagnosis. This is not three series — it is one measure
 * (kg CO2) at three values, so its colour job is sequential, not categorical:
 * one hue, and the bar's length carries the magnitude. The bars are all clay,
 * the numbers all wear text tokens, and the recommendation is marked by a
 * labelled tag rather than by hue, so it survives being printed in greyscale.
 */
export function ComparisonGrid({ options }: { options: CompareOption[] }) {
  const maxCo2 = Math.max(...options.map((option) => option.co2Kg), 0.01);
  const bestCo2 = Math.min(...options.map((option) => option.co2Kg));

  return (
    <ul className="grid list-none gap-3 p-0 sm:grid-cols-3">
      {options.map((option) => {
        const isBest = option.co2Kg === bestCo2;

        return (
          <Card
            as="li"
            key={option.mode}
            elevation={isBest ? "md" : "none"}
            className={cn(
              "gap-2 p-4",
              // Emphasis is structural: a ring and elevation, not a fill, so the
              // three cards stay comparable at a glance.
              isBest && "ring-2 ring-clay",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <CardKicker>{option.label}</CardKicker>
              {isBest ? <Tag tone="sage">Lowest</Tag> : null}
            </div>

            <p className="font-display text-2xl leading-none">
              {formatCo2(option.co2Kg)}
            </p>

            {/* One hue, shared scale. Length is the encoding; the fill is
                constant so it adds no second, redundant signal. */}
            <div
              aria-hidden
              className="h-1.5 w-full overflow-hidden rounded-full bg-sand-300"
            >
              <div
                className="h-full rounded-full bg-clay-600"
                style={{ width: `${(option.co2Kg / maxCo2) * 100}%` }}
              />
            </div>

            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
              <dt className="text-ink/55">Cost</dt>
              <dd className="font-semibold">{formatMoney(option.costAud)}</dd>
              <dt className="text-ink/55">Time</dt>
              <dd className="font-semibold">{formatDuration(option.durationMin)}</dd>
            </dl>

            <p className="text-xs text-ink/55">{option.detail.join(" · ")}</p>
          </Card>
        );
      })}
    </ul>
  );
}
