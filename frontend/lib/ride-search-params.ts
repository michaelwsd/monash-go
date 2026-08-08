import type { RideSearchFilters, RideSort } from "@/lib/data/queries";
import { CAMPUSES, FUEL_TYPES, type Campus, type FuelType } from "@/lib/types";

/**
 * The `/rides` query-string contract.
 *
 * Search state lives in the URL, not in React state. That is the decision this
 * file exists to hold, and it buys four things: a search is shareable and
 * bookmarkable, the back button steps through searches, the results can be
 * rendered on the server, and the sort control can be plain links that work with
 * JavaScript disabled.
 *
 * Parsing and serialising sit together so a change to a parameter name cannot
 * update one direction and miss the other.
 */

/** What Next.js hands a page as `searchParams`. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

export interface RideSearchState {
  origin: Campus;
  destination: Campus;
  date: string;
  minSeats: number;
  fuelTypes: FuelType[];
  sort: RideSort;
}

const DEFAULTS: RideSearchState = {
  origin: "clayton",
  destination: "caulfield",
  // The fixture week. A real deployment defaults to today; this is the one value
  // that will change when the backend lands.
  date: "2026-08-10",
  minSeats: 1,
  fuelTypes: [],
  sort: "departure",
};

const SORTS: RideSort[] = ["departure", "co2", "cost"];

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const all = (value: string | string[] | undefined): string[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

/**
 * Read the URL into a fully-populated state.
 *
 * Every unknown or malformed value falls back to its default rather than
 * throwing. A URL is user input — someone will hand-edit `?sort=cheapest`, and
 * a 500 is the wrong answer to a typo in a query string.
 */
export function parseRideSearch(params: RawSearchParams): RideSearchState {
  const origin = first(params.origin);
  const destination = first(params.destination);
  const date = first(params.date);
  const seats = Number(first(params.seats));
  const sort = first(params.sort);

  return {
    origin: CAMPUSES.includes(origin as Campus) ? (origin as Campus) : DEFAULTS.origin,
    destination: CAMPUSES.includes(destination as Campus)
      ? (destination as Campus)
      : DEFAULTS.destination,
    date: /^\d{4}-\d{2}-\d{2}$/.test(date ?? "") ? date! : DEFAULTS.date,
    minSeats: Number.isInteger(seats) && seats >= 1 && seats <= 4 ? seats : DEFAULTS.minSeats,
    fuelTypes: all(params.fuel).filter((value): value is FuelType =>
      FUEL_TYPES.includes(value as FuelType),
    ),
    sort: SORTS.includes(sort as RideSort) ? (sort as RideSort) : DEFAULTS.sort,
  };
}

/** The shape `searchRides` wants. */
export function toFilters(state: RideSearchState): RideSearchFilters {
  return {
    origin: state.origin,
    destination: state.destination,
    date: state.date,
    minSeats: state.minSeats,
    fuelTypes: state.fuelTypes,
    sort: state.sort,
  };
}

/**
 * A `/rides` href with some of the state replaced.
 *
 * Used by the sort chips, which must change one parameter and preserve the rest
 * — a sort control that silently resets the date is a bug users cannot diagnose.
 */
export function rideSearchHref(
  state: RideSearchState,
  patch: Partial<RideSearchState> = {},
): string {
  const next = { ...state, ...patch };
  const query = new URLSearchParams();

  query.set("origin", next.origin);
  query.set("destination", next.destination);
  query.set("date", next.date);
  if (next.minSeats !== DEFAULTS.minSeats) query.set("seats", String(next.minSeats));
  for (const fuel of next.fuelTypes) query.append("fuel", fuel);
  if (next.sort !== DEFAULTS.sort) query.set("sort", next.sort);

  return `/rides?${query.toString()}`;
}
