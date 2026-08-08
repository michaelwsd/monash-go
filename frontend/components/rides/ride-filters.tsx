"use client";

import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";

import {
  Button,
  Card,
  CheckChipGroup,
  ChoiceGroup,
  Field,
  Icon,
  Input,
  Select,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatCampus, formatFuelType } from "@/lib/format";
import type { RideSearchState } from "@/lib/ride-search-params";
import { CAMPUSES, FUEL_TYPES } from "@/lib/types";

const SEAT_OPTIONS = [
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3+" },
] as const;

const FUEL_OPTIONS = FUEL_TYPES.map((fuel) => ({
  value: fuel,
  label: formatFuelType(fuel),
}));

/**
 * Wireframe 1a's filter rail, and 1d's filter sheet — one component.
 *
 * It is a plain `<form method="get">`. Submitting navigates to `/rides` with the
 * fields as the query string, which is exactly the URL contract in
 * `ride-search-params.ts`. No fetch, no router push, no client state for the
 * values themselves: the browser has done this since 1995 and does it correctly,
 * including the back button.
 *
 * The only thing React is holding is whether the sheet is open on a phone. That
 * is why this file carries "use client" and why the disclosure button is the
 * sole interactive piece — everything else would work with JavaScript disabled.
 */
export function RideFilters({ state }: { state: RideSearchState }) {
  const [open, setOpen] = useState(false);
  const activeCount = state.fuelTypes.length + (state.minSeats > 1 ? 1 : 0);

  return (
    <div className="lg:sticky lg:top-20">
      <Button
        variant="secondary"
        size="md"
        fullWidth
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls="ride-filters"
        className="lg:hidden"
      >
        <Icon as={SlidersHorizontal} size={15} />
        Filters
        {activeCount > 0 ? ` (${activeCount})` : ""}
      </Button>

      <Card
        id="ride-filters"
        // Always rendered so its fields are in the DOM for a form submit even
        // when the sheet is shut; visibility is the only thing that changes.
        className={cn("mt-2 gap-3 p-4 lg:mt-0 lg:block", open ? "block" : "hidden")}
      >
        <form method="get" action="/rides" className="flex flex-col gap-3">
          {/* Sorting is chosen by the chips above the results, not here, but it
              must survive a filter change — hence the hidden carry-through. */}
          <input type="hidden" name="sort" value={state.sort} />

          <Field label="From" htmlFor="filter-origin">
            <Select id="filter-origin" name="origin" defaultValue={state.origin}>
              {CAMPUSES.map((campus) => (
                <option key={campus} value={campus}>
                  {formatCampus(campus)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="To" htmlFor="filter-destination">
            <Select
              id="filter-destination"
              name="destination"
              defaultValue={state.destination}
            >
              {CAMPUSES.map((campus) => (
                <option key={campus} value={campus}>
                  {formatCampus(campus)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Date" htmlFor="filter-date">
            <Input
              id="filter-date"
              name="date"
              type="date"
              defaultValue={state.date}
            />
          </Field>

          <div>
            <p className="label mb-1">Seats</p>
            <ChoiceGroup
              name="seats"
              legend="Minimum seats"
              options={SEAT_OPTIONS}
              defaultValue={String(state.minSeats)}
            />
          </div>

          <div>
            <p className="label mb-1">Vehicle</p>
            <CheckChipGroup
              name="fuel"
              legend="Fuel type"
              options={FUEL_OPTIONS}
              defaultValue={state.fuelTypes}
            />
          </div>

          <Button type="submit" variant="primary" size="lg" fullWidth className="mt-1">
            Search
          </Button>
        </form>
      </Card>
    </div>
  );
}
