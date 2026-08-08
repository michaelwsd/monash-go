import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import {
  ManualVehicleForm,
  type VehiclePrefill,
} from "@/components/vehicles/manual-vehicle-form";
import { VehicleLookup } from "@/components/vehicles/vehicle-lookup";
import { searchVehicleReference } from "@/lib/data/queries";
import type { RawSearchParams } from "@/lib/ride-search-params";
import { FUEL_TYPES, type FuelType } from "@/lib/types";

export const metadata: Metadata = {
  title: "Add your car",
};

const one = (value: string | string[] | undefined): string =>
  (Array.isArray(value) ? value[0] : value) ?? "";

/**
 * Wireframe 1l — vehicle registration.
 *
 * Lookup first, manual entry always visible under it. The endpoint contract is
 * explicit that the reference lookup "is a convenience that saves typing, never a
 * precondition", so the manual form is not behind a disclosure — a driver of an MG
 * or a ute reaches it without discovering that their car is missing first.
 *
 * Both halves are driven by the query string: `?q=` runs the search, and the
 * `make`/`model`/`year`/`fuel`/`consumption` params prefill the form. That is why
 * a chosen reference row survives a reload and why the two components need no
 * shared client state.
 */
export default async function AddVehiclePage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const query = one(params.q);
  const results = await searchVehicleReference(query);

  const rawFuel = one(params.fuel);
  const prefill: VehiclePrefill = {
    make: one(params.make),
    model: one(params.model),
    year: one(params.year),
    fuelType: FUEL_TYPES.includes(rawFuel as FuelType)
      ? (rawFuel as FuelType)
      : "petrol",
    consumption: one(params.consumption),
  };

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4">
      <PageHeader
        title="Add your car"
        subtitle="Its fuel consumption is what makes the emissions and cost estimates real."
      />

      <VehicleLookup query={query} results={results} />

      <ManualVehicleForm prefill={prefill} />
    </div>
  );
}
