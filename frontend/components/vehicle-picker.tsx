"use client";

import { useState } from "react";
import { Check, Loader2, Search } from "lucide-react";

import { TextField, SelectField, type SelectOption } from "@/components/form-fields";
import { consumptionUnit, type FuelType, type VehicleReference } from "@/lib/api";
import { useVehicleSearch } from "@/lib/use-vehicle-search";

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

function describe(row: VehicleReference): string {
  return `${fuelTypeLabel(row.fuel_type)} · ${row.avg_consumption} ${consumptionUnit(row.fuel_type)}`;
}

interface VehiclePickerProps {
  value: CarDetails;
  onChange: (car: CarDetails) => void;
}

export default function VehiclePicker({ value, onChange }: VehiclePickerProps) {
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
    <div className="space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-4">

      {/* Make and model are separate columns in the reference table, so they
          are separate fields here. Year does two jobs: it narrows the search,
          and POST /vehicles requires it.

          `relative` anchors the results panel below. It floats rather than
          sitting in the flow: twenty rows inline would triple the height of the
          card and shove the fuel type fields off the screen every time someone
          types. Escape closes it, as does moving focus out of this block. */}
      <div
        className="relative"
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_6rem]">
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
          <ul className="absolute inset-x-0 top-full z-20 mt-1.5 max-h-56 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
            {results.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  /* Keeps focus in the input, so the panel does not close on
                     mousedown before the click lands. Buttons are not focused
                     by a click on macOS, which is exactly where that bites. */
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(row)}
                  className="flex w-full items-baseline justify-between gap-3 px-3 py-2.5 text-left hover:bg-gray-50 focus:outline-none focus-visible:bg-gray-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600"
                >
                  <span className="min-w-0 text-sm text-gray-900">
                    <span className="font-medium">
                      {row.make} {row.model}
                    </span>{" "}
                    <span className="text-gray-500">{row.year}</span>
                  </span>
                  <span className="shrink-0 text-xs text-gray-500">
                    {describe(row)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
          <span className="flex min-w-0 items-center gap-2">
            <Check className="h-4 w-4 shrink-0 text-emerald-600" />
            <span className="min-w-0 text-sm text-emerald-900">
              Matched{" "}
              <span className="font-medium">
                {value.make} {value.model} {value.year}
              </span>
              <span className="block text-xs text-emerald-700 sm:inline sm:before:content-['_·_']">
                {fuelTypeLabel(value.fuelType)} · {value.fuelConsumption}{" "}
                {consumptionUnit(value.fuelType)}
              </span>
            </span>
          </span>
          <button
            type="button"
            onClick={() => editSearch({})}
            className="shrink-0 rounded text-xs font-medium text-emerald-800 underline underline-offset-2 hover:text-emerald-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            Change
          </button>
        </div>
      )}

      {/* One line, in the flow. The panel above floats because it is long; a
          status line is short, and floating it would hide the guidance the
          moment the driver moves down to fill the fields in by hand. */}
      {showResults && status === "loading" && (
        <p
          aria-live="polite"
          className="flex items-center gap-2 px-1 text-xs text-gray-500"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Searching&hellip;
        </p>
      )}

      {showResults && status === "error" && (
        <p aria-live="polite" className="px-1 text-xs text-amber-700">
          {error}
        </p>
      )}

      {showResults && status === "ready" && results.length === 0 && (
        <p
          aria-live="polite"
          className="flex items-start gap-2 px-1 text-xs text-gray-500"
        >
          <Search className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Not in our database - fill in the year, fuel type and consumption
          yourself and we&rsquo;ll use those instead.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
            selected ? "cursor-not-allowed bg-gray-100 text-gray-500" : undefined
          }
        />
      </div>
    </div>
  );
}
