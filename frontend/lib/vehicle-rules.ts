import type { FuelType } from "./types";

/**
 * Plausible consumption bounds, by unit.
 *
 * Two ranges, not one, because the unit changes with the fuel type: 30 is an
 * absurd figure in L/100km and an ordinary one in kWh/100km. A single bound would
 * either reject real EVs or wave through a petrol car that supposedly burns
 * 30 L/100km.
 *
 * This lives in its own module rather than beside the Server Action that enforces
 * it, because a `"use server"` file may only export async functions — a constant
 * exported from one is a build error. Both the client form and the action import
 * it here, so the message a user sees and the rule that rejects them cannot drift.
 */
export const CONSUMPTION_BOUNDS = {
  liquid: { min: 0.1, max: 30, unit: "L/100km" },
  electric: { min: 1, max: 50, unit: "kWh/100km" },
} as const;

export type ConsumptionBounds = (typeof CONSUMPTION_BOUNDS)[keyof typeof CONSUMPTION_BOUNDS];

export function boundsFor(fuelType: FuelType): ConsumptionBounds {
  return fuelType === "electric"
    ? CONSUMPTION_BOUNDS.electric
    : CONSUMPTION_BOUNDS.liquid;
}

export function consumptionError(
  value: string,
  fuelType: FuelType,
): string | undefined {
  if (value.trim() === "") return undefined;

  const bounds = boundsFor(fuelType);
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) return "Enter a number.";
  if (parsed < bounds.min || parsed > bounds.max) {
    return `Must be between ${bounds.min} and ${bounds.max} ${bounds.unit}.`;
  }
  return undefined;
}
