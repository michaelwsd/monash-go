import { ChipLink } from "@/components/ui";

export type TripTab = "upcoming" | "past";
export type TripRole = "all" | "driver" | "passenger";

export interface TripFilterState {
  tab: TripTab;
  role: TripRole;
}

const TABS: { value: TripTab; label: string }[] = [
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
];

const ROLES: { value: TripRole; label: string }[] = [
  { value: "all", label: "All" },
  { value: "driver", label: "As driver" },
  { value: "passenger", label: "As passenger" },
];

function href(state: TripFilterState, patch: Partial<TripFilterState>): string {
  const next = { ...state, ...patch };
  const query = new URLSearchParams({ tab: next.tab });
  if (next.role !== "all") query.set("role", next.role);
  return `/trips?${query.toString()}`;
}

/**
 * The two filter rows on My trips.
 *
 * The wireframe draws all four chips in one row — Upcoming, Past, As driver, As
 * passenger — which reads as one control but is two: a time filter and a role
 * filter, independent of each other. Split into two labelled rows so it is clear
 * that picking "As driver" does not clear "Past".
 *
 * Links again, so both filters are in the URL and the back button works.
 */
export function TripFilters({ state }: { state: TripFilterState }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="label">When</span>
        {TABS.map((tab) => (
          <ChipLink
            key={tab.value}
            href={href(state, { tab: tab.value })}
            selected={state.tab === tab.value}
          >
            {tab.label}
          </ChipLink>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="label">Role</span>
        {ROLES.map((role) => (
          <ChipLink
            key={role.value}
            href={href(state, { role: role.value })}
            selected={state.role === role.value}
          >
            {role.label}
          </ChipLink>
        ))}
      </div>
    </div>
  );
}
