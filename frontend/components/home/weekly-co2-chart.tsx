import { cn } from "@/lib/cn";
import { formatCo2 } from "@/lib/format";

interface WeeklyCo2ChartProps {
  /** kg avoided per week, oldest first. */
  weeks: number[];
  className?: string;
}

/**
 * Eight weeks of CO2 avoided, as columns.
 *
 * Design decisions, in the order they were made:
 *
 * 1. Form. Magnitude over eight discrete periods — columns, not a line. A line
 *    implies a continuous quantity sampled at those points; weekly totals are
 *    eight separate sums.
 * 2. Colour. One series, so the job is sequential, not categorical: a single
 *    hue, and no legend box (the caption already names what is plotted). Sage
 *    is fixed by the site's own rule that green numbers are CO2. `sage-600`
 *    specifically — it clears 3:1 against the card surface, where `sage-500`
 *    measures 2.11:1 and would need a text fallback to be legible.
 * 3. Marks. Columns capped at 24px with a 4px rounded cap and a square
 *    baseline, air between bands rather than fat bars, and a hairline baseline
 *    instead of gridlines.
 * 4. Labels, sparingly. Only the best week is labelled; the axis is replaced by
 *    two endpoint captions. A number over all eight would be unreadable at this
 *    size and goes unread at any size.
 * 5. Access. The bars are `aria-hidden` and the same numbers are published as a
 *    visually hidden table. Eight tab stops in a thumbnail chart is worse than
 *    no keyboard affordance; a table is better than both.
 */
export function WeeklyCo2Chart({ weeks, className }: WeeklyCo2ChartProps) {
  const max = Math.max(...weeks, 0.1);
  const peakIndex = weeks.indexOf(Math.max(...weeks));

  return (
    <figure className={cn("m-0", className)}>
      <div aria-hidden className="flex h-16 items-end gap-0.5">
        {weeks.map((value, index) => {
          const isPeak = index === peakIndex;
          // A zero week gets a baseline tick rather than nothing, so "no rides"
          // is visibly different from "no data".
          const heightPercent = value === 0 ? 0 : (value / max) * 100;

          return (
            <div
              key={index}
              className="group relative flex flex-1 justify-center self-stretch"
            >
              <div className="flex w-full max-w-[24px] flex-col justify-end">
                {isPeak && value > 0 ? (
                  <span className="mb-0.5 text-center text-[9px] font-semibold text-ink/70">
                    {value.toFixed(1)}
                  </span>
                ) : null}
                <div
                  className={cn(
                    "w-full rounded-t-[4px] transition-colors duration-150",
                    value === 0 ? "bg-sand-400" : "bg-sage-600 group-hover:bg-sage-700",
                  )}
                  style={{ height: value === 0 ? "2px" : `${heightPercent}%` }}
                />
              </div>

              {/* Per-mark tooltip. Pointer-events off so it cannot steal the
                  hover from the column underneath it. */}
              <span className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full rounded-full bg-ink px-2 py-1 text-[10px] whitespace-nowrap text-ground opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                {index === weeks.length - 1
                  ? "This week"
                  : `${weeks.length - 1 - index} wks ago`}
                : {formatCo2(value)}
              </span>
            </div>
          );
        })}
      </div>

      <div aria-hidden className="mt-1 h-px w-full bg-divider" />

      <figcaption
        aria-hidden
        className="mt-1 flex justify-between text-[10px] text-ink/55"
      >
        <span>8 weeks ago</span>
        <span>This week</span>
      </figcaption>

      <table className="sr-only">
        <caption>CO₂ avoided per week, last eight weeks</caption>
        <thead>
          <tr>
            <th scope="col">Week</th>
            <th scope="col">CO₂ avoided</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((value, index) => (
            <tr key={index}>
              <th scope="row">
                {index === weeks.length - 1
                  ? "This week"
                  : `${weeks.length - 1 - index} weeks ago`}
              </th>
              <td>{formatCo2(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
