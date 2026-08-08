"use server";

import { redirect } from "next/navigation";

import { boundsFor } from "@/lib/vehicle-rules";
import type { FuelType } from "@/lib/types";

/**
 * `POST /vehicles` — registers a car.
 *
 * A `"use server"` module may only export async functions, which is why the
 * bounds this validates against live in `lib/vehicle-rules.ts` and are imported.
 * That is also what lets the client form show the same message before submitting.
 */
export async function addVehicle(formData: FormData): Promise<void> {
  const fuelType = String(formData.get("fuelType") ?? "") as FuelType;
  const consumption = Number(formData.get("fuelConsumption"));
  const bounds = boundsFor(fuelType);

  // Re-validated here even though the form already checked. The client check is
  // an affordance; this one is the rule. A Server Action is reachable by direct
  // POST, so anything only checked in the browser is not checked.
  if (
    !Number.isFinite(consumption) ||
    consumption < bounds.min ||
    consumption > bounds.max
  ) {
    throw new Error(
      `addVehicle: consumption must be between ${bounds.min} and ${bounds.max} ${bounds.unit}`,
    );
  }

  // TODO(backend): verify the Clerk session, then POST {API}/api/v1/vehicles.
  //
  // `fuel_consumption` is taken from the form and never required to match a
  // vehicle_reference row. MG, GWM, BYD, LDV, Chery, Haval and most utes are
  // absent from the reference table because its source data is Canadian, and
  // those brands were roughly 12% of the 2025 Australian market. A driver whose
  // car is missing must still be able to register it.
  redirect("/profile");
}
