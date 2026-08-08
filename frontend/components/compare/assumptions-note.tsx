import { Callout } from "@/components/ui";
import { FLEET_AVG_RATE, MYKI_FARE } from "@/lib/emissions";
import type { Comparison } from "@/lib/types";

/**
 * What the comparison assumed.
 *
 * Not boilerplate. The CO2-avoided figure rests on a counterfactual — that every
 * passenger would otherwise have driven alone — which over-credits carpooling
 * because some of them would have caught a train. CLAUDE.md requires that
 * assumption to be stated wherever the constant appears, so it appears here,
 * beside the number it produced, rather than in a footer nobody opens.
 *
 * The constants are read from `lib/emissions.ts` rather than typed into the
 * sentence, so the text cannot drift from the arithmetic.
 */
export function AssumptionsNote({ comparison }: { comparison: Comparison }) {
  const fare =
    comparison.fare === "concession" ? MYKI_FARE.concession : MYKI_FARE.full;

  return (
    <Callout tone="muted" className="leading-relaxed">
      <p className="m-0">
        Emissions use the NGA 2024 factors; fuel cost uses today&rsquo;s average
        Victorian pump price, and transport uses the{" "}
        {comparison.fare} myki 2-hour fare (${fare.toFixed(2)}).
      </p>
      <p className="m-0 mt-1.5">
        &ldquo;Saves versus solo&rdquo; assumes you would otherwise have driven
        yourself at the Australian fleet average of {FLEET_AVG_RATE.toFixed(4)} kg
        CO₂ per km. If you would have caught the train instead, the real saving is
        smaller.
      </p>
    </Callout>
  );
}
