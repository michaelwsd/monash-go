"use client";

import { useState } from "react";
import { Check, Loader2, Search } from "lucide-react";

import { TextField, SelectField, type SelectOption } from "@/components/form-fields";
import { consumptionUnit, type FuelType, type VehicleReference } from "@/lib/api";
import { useVehicleSearch } from "@/lib/use-vehicle-search";
import { cn } from "@/lib/utils";

/* Values are what the backend's FuelType literal expects; labels are what the
   user reads. Storing the value means no translation at request time. */
const FUEL_TYPE_OPTIONS: readonly SelectOption[] = [
  { value: "petrol", label: "Petrol" },
  { value: "diesel", label: "Diesel" },
  { value: "hybrid", label: "Hybrid" },
  { value: "electric", label: "Electric" },
];

export function fuelTypeLabel(value: FuelType | ""): string {
  return FUEL_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? "";
}

/**
 * Everything POST /vehicles will eventually need, in the form's own shape.
 *
 * `year` and `fuelConsumption` are strings because that is what an input holds
 * while it is being typed - "20" on the way to "2020" is not a year. The
 * conversion to numbers belongs at the request boundary, not in the keystroke
 * path.
 *
 * `referenceId` is set only when the driver picked a row from the dataset. The
 * backend then lets that row win for every field, so the make, model, year,
 * fuel type and consumption alongside it are display copies of the same row.
 */
export interface CarDetails {
  make: string;
  model: string;
  year: string;
  fuelType: FuelType | "";
  fuelConsumption: string;
  referenceId: number | null;
}

export const EMPTY_CAR: CarDetails = {
  make: "",
  model: "",
  year: "",
  fuelType: "",
  fuelConsumption: "",
  referenceId: null,
};

/**
 * Enough to register with POST /vehicles, which requires every one of these -
 * VehicleCreate validates the whole body even when reference_id is set.
 *
 * Picking a row from the dataset fills all five at once, so this only ever
 * bites on a manual entry. That path has to stay open: the reference data is
 * Canadian, so MG, GWM, BYD, LDV, Chery, Haval and most utes are missing from
 * it - roughly 12% of the 2025 Australian market - and a driver whose car is
 * absent must still be able to register it by typing.
 */
export function isCarUsable(car: CarDetails): boolean {
  return (
    car.make.trim().length > 0 &&
    car.model.trim().length > 0 &&
    searchableYear(car.year) !== undefined &&
    car.fuelType !== "" &&
    Number(car.fuelConsumption) > 0
  );
}

/** A year is only worth sending to the search once it could actually be one. */
function searchableYear(year: string): number | undefined {
  const parsed = Number(year);
  return /^\d{4}$/.test(year) && parsed >= 1950 && parsed <= 2100
    ? parsed
    : undefined;
}

/* Fuel type as a chip rather than another run of grey text: it is the one
   categorical field in the row, so it is what someone scanning for "the hybrid
   one" is actually looking for. Hybrid and electric take the eco tint, which
   is the same signal the rest of the app uses for a low-emissions figure. */
function FuelChip({ fuelType }: { fuelType: FuelType }) {
  const low = fuelType === "hybrid" || fuelType === "electric";
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-medium tracking-[0.02em] ${
        low ? "bg-eco-muted text-eco-foreground" : "bg-muted text-muted-foreground"
      }`}
    >
      {fuelTypeLabel(fuelType)}
    </span>
  );
}

interface VehiclePickerProps {
  value: CarDetails;
  onChange: (car: CarDetails) => void;
  /** For a caller that caps the height, e.g. `min-h-0` inside a dialog with a
      max-height. The results list then gives way instead of pushing the fuel
      fields out of view. */
  className?: string;
}

export default function VehiclePicker({
  value,
  onChange,
  className,
}: VehiclePickerProps) {
  const selected = value.referenceId !== null;

  /* Whether the results panel is showing. Focus opens it, Escape and moving
     focus out of the search block close it - otherwise a stale list hangs over
     the fields below after the driver has moved on. */
  const [open, setOpen] = useState(false);
  const { results, status, error } = useVehicleSearch(
    selected ? "" : value.make,
    value.model,
    searchableYear(value.year),
  );

  /* Editing any of the three search fields drops a previous dataset pick: the
     row no longer describes what is in the boxes. Fuel type survives, because
     the driver may have chosen it themselves before searching. */
  const editSearch = (patch: Partial<CarDetails>) =>
    onChange({
      ...value,
      ...patch,
      referenceId: null,
      ...(selected ? { fuelConsumption: "" } : {}),
    });

  const choose = (row: VehicleReference) => {
    setOpen(false);
    onChange({
      make: row.make,
      model: row.model,
      year: String(row.year),
      fuelType: row.fuel_type,
      fuelConsumption: String(row.avg_consumption),
      referenceId: row.id,
    });
  };

  const showResults = !selected && value.make.trim().length >= 2;

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col gap-4 rounded-xl border border-border bg-muted/50 p-4",
        className,
      )}
    >

      {/* Make and model are separate columns in the reference table, so they
          are separate fields here. Year does two jobs: it narrows the search,
          and POST /vehicles requires it.

          Escape closes the results, as does moving focus out of this block. */}
      <div
        className="flex min-h-0 flex-col"
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
        }}
      >
        <div className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_6rem]">
          <TextField
            label="Make"
            placeholder="Toyota"
            autoComplete="off"
            value={value.make}
            onFocus={() => setOpen(true)}
            onChange={(e) => editSearch({ make: e.target.value })}
          />
          <TextField
            label="Model"
            placeholder="Corolla"
            autoComplete="off"
            value={value.model}
            onFocus={() => setOpen(true)}
            onChange={(e) => editSearch({ model: e.target.value })}
          />
          <TextField
            label="Year"
            placeholder="2020"
            inputMode="numeric"
            maxLength={4}
            autoComplete="off"
            value={value.year}
            onFocus={() => setOpen(true)}
            onChange={(e) =>
              editSearch({ year: e.target.value.replace(/\D/g, "").slice(0, 4) })
            }
          />
        </div>

        {showResults && open && results.length > 0 && (
          /* In the flow, not floating.

             It used to be absolutely positioned, on the reasoning that twenty
             rows inline would triple the height of the card. Floating turned
             out worse: Card sets overflow-hidden, so the panel was sliced off
             at the card's edge, and what survived covered the fuel fields and
             the Save button underneath it. Capping the height solves the
             original problem without either. The block appears once at a fixed
             size and pushes the fields down by that much, rather than jumping
             on every keystroke.

             min-h-0 and the default flex-shrink, rather than a plain
             max-height: normally the list is its own height and the container
             grows around it, but where a caller caps the height this is the
             only child not marked shrink-0, so it is the one that gives way.
             The fuel type and consumption fields never get pushed off. */
          <div className="mt-2 flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-background">
            {/* Says how many there are and why they are in this order. Without
                it a sliced-off bottom row is the only clue the list scrolls. */}
            <p className="shrink-0 border-b border-border bg-muted/50 px-3 py-1.5 text-[10px] font-medium tracking-[0.04em] text-muted-foreground uppercase">
              {results.length} {results.length === 1 ? "match" : "matches"}
              <span className="normal-case"> &middot; newest first</span>
            </p>

            {/* A hair over four rows, so the fifth peeks and the list visibly
                continues. overscroll-contain keeps the page still once it
                bottoms out. */}
            <ul className="max-h-[12.5rem] min-h-0 overflow-y-auto overscroll-contain">
              {results.map((row) => (
                <li key={row.id} className="border-t border-border/60 first:border-t-0">
                  <button
                    type="button"
                    /* Keeps focus in the input, so the panel does not close on
                       mousedown before the click lands. Buttons are not focused
                       by a click on macOS, which is exactly where that bites. */
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(row)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-muted focus:outline-none focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-eco"
                  >
                    <span className="min-w-0 truncate text-sm text-foreground">
                      <span className="font-medium">
                        {row.make} {row.model}
                      </span>{" "}
                      <span className="tabular-nums text-muted-foreground">
                        {row.year}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <FuelChip fuelType={row.fuel_type} />
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {row.avg_consumption} {consumptionUnit(row.fuel_type)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {selected && (
        <div className="flex shrink-0 items-center justify-between gap-3 rounded-lg border border-eco-border bg-eco-muted px-3 py-2.5">
          <span className="flex min-w-0 items-center gap-2">
            <Check className="h-4 w-4 shrink-0 text-eco" />
            <span className="min-w-0 text-sm text-eco-foreground">
              Matched{" "}
              <span className="font-medium">
                {value.make} {value.model} {value.year}
              </span>
              <span className="block text-xs text-eco-foreground/80 sm:inline sm:before:content-['_·_']">
                {fuelTypeLabel(value.fuelType)} · {value.fuelConsumption}{" "}
                {consumptionUnit(value.fuelType)}
              </span>
            </span>
          </span>
          <button
            type="button"
            onClick={() => editSearch({})}
            className="shrink-0 rounded text-xs font-medium text-eco-foreground underline underline-offset-2 hover:text-eco focus:outline-none focus-visible:ring-2 focus-visible:ring-eco"
          >
            Change
          </button>
        </div>
      )}

      {/* Status lines, and the fields a driver fills in when the dataset has
          nothing. All shrink-0: if space runs short it is the results list
          that gives way, never the controls. */}
      {showResults && status === "loading" && (
        <p
          aria-live="polite"
          className="flex shrink-0 items-center gap-2 px-1 text-xs text-muted-foreground"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Searching&hellip;
        </p>
      )}

      {showResults && status === "error" && (
        <p aria-live="polite" className="shrink-0 px-1 text-xs text-amber-700">
          {error}
        </p>
      )}

      {showResults && status === "ready" && results.length === 0 && (
        <p
          aria-live="polite"
          className="flex shrink-0 items-start gap-2 px-1 text-xs text-muted-foreground"
        >
          <Search className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Not in our database - fill in the year, fuel type and consumption
          yourself and we&rsquo;ll use those instead.
        </p>
      )}

      <div className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-2">
        <SelectField
          label="Fuel type"
          placeholder="Select fuel type"
          options={FUEL_TYPE_OPTIONS}
          value={value.fuelType}
          onValueChange={(fuelType) =>
            onChange({ ...value, fuelType: fuelType as FuelType })
          }
          /* A picked row owns every field, so editing this one here would put
             the form out of step with the reference data behind it. */
          disabled={selected}
        />
        <TextField
          label="Consumption"
          suffix={consumptionUnit(value.fuelType)}
          hint={selected ? "from our data" : undefined}
          placeholder={value.fuelType === "electric" ? "16.5" : "7.1"}
          inputMode="decimal"
          autoComplete="off"
          readOnly={selected}
          value={value.fuelConsumption}
          onChange={(e) =>
            onChange({
              ...value,
              fuelConsumption: e.target.value.replace(/[^\d.]/g, ""),
            })
          }
          className={
            selected ? "cursor-not-allowed bg-muted text-muted-foreground" : undefined
          }
        />
      </div>
    </div>
  );
}
