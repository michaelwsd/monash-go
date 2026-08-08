"use client";

import { useState } from "react";

import {
  Button,
  Card,
  CardKicker,
  ChoiceGroup,
  Field,
  Input,
} from "@/components/ui";
import { addVehicle } from "@/lib/actions/vehicles";
import { formatFuelType } from "@/lib/format";
import { boundsFor, consumptionError } from "@/lib/vehicle-rules";
import { FUEL_TYPES, type FuelType } from "@/lib/types";

export interface VehiclePrefill {
  make: string;
  model: string;
  year: string;
  fuelType: FuelType;
  consumption: string;
}

const FUEL_OPTIONS = FUEL_TYPES.map((fuel) => ({
  value: fuel,
  label: formatFuelType(fuel),
}));

/**
 * Manual entry — always reachable, never a fallback the user has to unlock.
 *
 * Two things make this a Client Component, and only two:
 *
 * 1. The consumption field's unit and bounds change with the fuel type. Picking
 *    Electric must relabel the field to kWh/100km, because entering 16.8 under an
 *    "L/100km" label is how a car ends up costed wrong by a factor of ten.
 * 2. The bounds message shows as you type rather than after a failed submit.
 *
 * `key` on the fieldset resets the inputs when a different reference row is
 * chosen — the prefill arrives as new props, and an uncontrolled input ignores a
 * changed `defaultValue` unless React is told to remount it.
 */
export function ManualVehicleForm({ prefill }: { prefill: VehiclePrefill }) {
  const [fuelType, setFuelType] = useState<FuelType>(prefill.fuelType);
  const [consumption, setConsumption] = useState(prefill.consumption);

  const bounds = boundsFor(fuelType);
  const error = consumptionError(consumption, fuelType);

  return (
    <Card id="manual" className="gap-3 p-4">
      <CardKicker>Your car</CardKicker>

      <form action={addVehicle} className="flex flex-col gap-3">
        <div
          key={`${prefill.make}-${prefill.model}-${prefill.year}`}
          className="grid gap-3 sm:grid-cols-[1fr_1fr_88px]"
        >
          <Field label="Make" htmlFor="vehicle-make">
            <Input
              id="vehicle-make"
              name="make"
              defaultValue={prefill.make}
              placeholder="MG"
              required
            />
          </Field>
          <Field label="Model" htmlFor="vehicle-model">
            <Input
              id="vehicle-model"
              name="model"
              defaultValue={prefill.model}
              placeholder="ZS EV"
              required
            />
          </Field>
          <Field label="Year" htmlFor="vehicle-year">
            <Input
              id="vehicle-year"
              name="year"
              type="number"
              min={1980}
              max={2030}
              defaultValue={prefill.year}
              placeholder="2023"
              required
            />
          </Field>
        </div>

        <div>
          <p className="label mb-1">Fuel type</p>
          <ChoiceGroup
            name="fuelType"
            legend="Fuel type"
            options={FUEL_OPTIONS}
            value={fuelType}
            onChange={setFuelType}
          />
        </div>

        <Field
          label={`Fuel use · ${bounds.unit}`}
          htmlFor="vehicle-consumption"
          hint={
            fuelType === "electric"
              ? "Electric cars are measured in kWh per 100 km, not litres."
              : `Between ${bounds.min} and ${bounds.max} ${bounds.unit}.`
          }
          error={error}
        >
          <Input
            id="vehicle-consumption"
            name="fuelConsumption"
            type="number"
            step="0.1"
            min={bounds.min}
            max={bounds.max}
            value={consumption}
            onChange={(event) => setConsumption(event.target.value)}
            aria-invalid={error ? true : undefined}
            placeholder={fuelType === "electric" ? "16.8" : "6.6"}
            required
          />
        </Field>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          disabled={Boolean(error) || consumption.trim() === ""}
        >
          Save vehicle
        </Button>
      </form>
    </Card>
  );
}
