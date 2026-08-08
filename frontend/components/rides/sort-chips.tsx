import { ChipLink } from "@/components/ui";
import type { RideSort } from "@/lib/data/queries";
import { rideSearchHref, type RideSearchState } from "@/lib/ride-search-params";

const OPTIONS: { value: RideSort; label: string }[] = [
  { value: "departure", label: "Departure" },
  { value: "co2", label: "Lowest CO₂" },
  { value: "cost", label: "Cost" },
];

/**
 * The sort control, as links.
 *
 * Each chip is an href to the same search with one parameter changed, so
 * sorting costs no JavaScript, prefetches like any other route, and leaves a
 * history entry the back button can undo. A `<select onChange>` would do none
 * of those and would hide two of the three options behind a tap.
 */
export function SortChips({ state }: { state: RideSearchState }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="label">Sort</span>
      {OPTIONS.map((option) => (
        <ChipLink
          key={option.value}
          href={rideSearchHref(state, { sort: option.value })}
          selected={state.sort === option.value}
          // The results are replaced below without a full page change, so the
          // list is announced as a live region by the page, not by each chip.
          scroll={false}
        >
          {option.label}
        </ChipLink>
      ))}
    </div>
  );
}
