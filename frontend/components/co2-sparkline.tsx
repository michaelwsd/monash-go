/**
 * Weekly CO2 avoided, as a compact bar sparkline.
 *
 * Bars rather than a line because the weeks are discrete buckets, not a
 * continuous signal. One series, so there is no legend - the caption beneath
 * names it. One hue for every bar: colour here carries no extra meaning, and
 * tinting by rank ("the newest one is darker") would imply one that isn't real.
 *
 * No per-bar numbers. The headline figure already sits above this in the same
 * card, so labelling all eight would just be noise; the values are on hover.
 *
 * Built from flex children rather than SVG so the bars stay crisp and the
 * corner radius never stretches as the card changes width.
 */
export function Co2Sparkline({
  weeklyKg,
  className,
}: {
  weeklyKg: number[];
  className?: string;
}) {
  const peak = Math.max(...weeklyKg);
  const total = weeklyKg.reduce((sum, kg) => sum + kg, 0);

  return (
    <div
      className={className}
      role="img"
      aria-label={`CO2 avoided per week over the last ${weeklyKg.length} weeks, ${total.toFixed(1)} kilograms in total, peaking at ${peak} kilograms.`}
    >
      {/* gap-0.5 is the 2px surface gap that keeps adjacent bars from reading
          as one block. items-end anchors every bar to the baseline. */}
      <div className="flex h-14 items-end gap-0.5">
        {weeklyKg.map((kg, index) => (
          <div
            key={index}
            // Native tooltip: no JavaScript, and it reaches keyboard and screen
            // reader users through the same attribute.
            title={`${weeklyKg.length - index} week${weeklyKg.length - index === 1 ? "" : "s"} ago: ${kg} kg`}
            style={{ height: `${Math.max((kg / peak) * 100, 6)}%` }}
            className="flex-1 rounded-t-[4px] bg-eco/80 transition-colors hover:bg-eco"
          />
        ))}
      </div>
    </div>
  );
}
