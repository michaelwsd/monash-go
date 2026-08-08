import {
  PET_STAGES,
  PET_STAGE_THRESHOLDS,
  type FuelType,
  type PetStage,
  type TransitLeg,
  type TransitMode,
} from "./types";

/**
 * Emissions and cost arithmetic.
 *
 * This mirrors the backend's `core/` package. The backend stays the source of
 * truth for anything persisted — `rides.co2_saved` and `points_earned` are
 * written server-side on completion and are never recomputed here.
 *
 * The frontend needs its own copy for exactly one reason: wireframe 1h shows a
 * live preview of what riders will see *while the driver is still filling in
 * the form*. There is no ride yet, so there is no `ride_id`, so
 * `GET /compare/{ride_id}` cannot answer it. Round-tripping keystrokes to the
 * server for a preview would be worse. Everything in this file is a pure
 * function over numbers, which is what makes duplicating it safe.
 *
 * Every constant is cited. If one disagrees with `core/constants.py`, that is a
 * bug in this file, not a local variation.
 */

/* ── Constants ────────────────────────────────────────────────────────────── */

/**
 * kg CO2-e per litre of fuel burned.
 * NGA Factors 2024 Table 9 (DCCEEW, 2024).
 * Hybrid uses the petrol factor — the saving is in consumption, not in the fuel.
 * Electric is zero scope 1; grid emissions are out of scope for the vehicle row.
 */
export const EMISSION_FACTORS: Record<FuelType, number> = {
  petrol: 2.31,
  diesel: 2.72,
  hybrid: 2.31,
  electric: 0,
};

/**
 * kg CO2-e per passenger-km by transit mode.
 * Derived in the proposal's Table 4. Melbourne's tram network has run on 100%
 * solar since 2019, hence zero.
 */
export const TRANSIT_FACTORS: Record<TransitMode, number> = {
  train: 0.038,
  bus: 0.077,
  tram: 0,
  walk: 0,
};

/**
 * kg CO2-e per km for the average Australian passenger vehicle.
 * (11.1 L/100km) x 2.31 kg/L = 0.2564. 11.1 L/100km is the ABS Survey of Motor
 * Vehicle Use fleet average (12 months to 30 June 2020, final release); the
 * petrol factor applies because petrol dominates the Australian light fleet.
 *
 * Assumed counterfactual: every passenger would otherwise have driven alone.
 * Some would have caught a train, so this over-credits. The assumption is
 * deliberate and must stay stated wherever this constant is used — see
 * `<AssumptionsNote>` on the ride detail page.
 */
export const FLEET_AVG_RATE = 0.2564;

/**
 * Victorian Default Offer 2026-27 residential single-rate usage charge, mean of
 * the five distribution zones, GST inclusive (Essential Services Commission,
 * 2026). Assumes home charging on a flat tariff.
 */
export const ELECTRICITY_PRICE_PER_KWH = 0.282;

/** Myki 2-hour fare, Zone 1+2, effective 1 January 2026. */
export const MYKI_FARE = {
  full: 5.7,
  concession: 2.85,
} as const;

/* ── Vehicle emissions ────────────────────────────────────────────────────── */

/**
 * kg CO2 for one person driving the whole distance alone.
 *
 * `consumption` is L/100km for petrol, diesel and hybrid, and kWh/100km for
 * electric. The electric factor is zero, so the unit mismatch cannot leak into
 * the result — but it very much can in `costSolo`, which is why that function
 * branches instead of sharing this shape.
 */
export function co2SoloKg(
  distanceKm: number,
  consumption: number,
  fuelType: FuelType,
): number {
  return distanceKm * (consumption / 100) * EMISSION_FACTORS[fuelType];
}

/** Each occupant's share of a shared drive. Includes the driver. */
export function co2PerOccupantKg(soloKg: number, occupants: number): number {
  return occupants > 0 ? soloKg / occupants : soloKg;
}

/** Sum of each leg's distance times its mode factor. */
export function co2TransitKg(legs: readonly TransitLeg[]): number {
  return legs.reduce(
    (total, leg) => total + leg.distanceKm * TRANSIT_FACTORS[leg.mode],
    0,
  );
}

/**
 * kg CO2 that carpooling avoided, calculated once when a ride completes.
 *
 *   avoided = max(0, passengers x distance x FLEET_AVG_RATE
 *                    - (passengers / occupants) x co2Solo)
 *
 * Read it as: the passengers would have emitted the first term driving
 * themselves; instead they emitted their share of this ride, the second term.
 *
 * The driver is excluded from the credit because they were making the trip
 * either way — which is exactly what makes a solo drive score zero.
 *
 * `max(0, ...)` is defensive only: across all 17,344 reference vehicles at 1-4
 * passengers, 6 of 69,376 combinations clamp, all supercars above 20 L/100km.
 */
export function co2AvoidedKg(
  passengers: number,
  distanceKm: number,
  soloKg: number,
): number {
  if (passengers <= 0) return 0;
  const occupants = passengers + 1;
  const counterfactual = passengers * distanceKm * FLEET_AVG_RATE;
  const actualShare = (passengers / occupants) * soloKg;
  return Math.max(0, counterfactual - actualShare);
}

/**
 * One passenger's own share of the credit.
 *
 * Algebraically this is `co2AvoidedKg(...) / passengers`: the total factors to
 * `passengers x (distance x FLEET_AVG_RATE - soloKg / occupants)`, so a single
 * rider's credit does not depend on how many others are aboard beyond its
 * effect on their own share. Ride cards quote this; the ride's stored
 * `co2_saved` quotes the total.
 */
export function co2AvoidedPerPassengerKg(
  distanceKm: number,
  perOccupantKg: number,
): number {
  return Math.max(0, distanceKm * FLEET_AVG_RATE - perOccupantKg);
}

/** points = floor(kg CO2 avoided x 100). */
export function pointsFor(avoidedKg: number): number {
  return Math.floor(avoidedKg * 100);
}

/* ── Pet progression ──────────────────────────────────────────────────────── */

/**
 * The stage a cumulative CO2 total earns, and what comes next.
 *
 * The backend owns `rewards.pet_stage`; this exists so the progress bar can say
 * "2.6 kg to hatch" without a second round trip. Thresholds come from
 * `PET_STAGE_THRESHOLDS`, which supersedes the proposal's figures.
 */
export function petProgress(totalCo2SavedKg: number): {
  stage: PetStage;
  nextStage: PetStage | null;
  nextStageAtKg: number | null;
  currentStageAtKg: number;
} {
  // Walk from the top so the highest cleared threshold wins.
  let stageIndex = 0;
  for (let i = PET_STAGES.length - 1; i >= 0; i -= 1) {
    if (totalCo2SavedKg >= PET_STAGE_THRESHOLDS[PET_STAGES[i]]) {
      stageIndex = i;
      break;
    }
  }

  const stage = PET_STAGES[stageIndex];
  const nextStage = PET_STAGES[stageIndex + 1] ?? null;

  return {
    stage,
    nextStage,
    nextStageAtKg: nextStage ? PET_STAGE_THRESHOLDS[nextStage] : null,
    currentStageAtKg: PET_STAGE_THRESHOLDS[stage],
  };
}

/* ── Cost ─────────────────────────────────────────────────────────────────── */

/** The most recent price per litre for each liquid fuel, from `fuel_prices`. */
export interface FuelPrices {
  petrol: number;
  diesel: number;
  hybrid: number;
}

/**
 * AUD to drive the distance alone, energy only. No parking, tolls or wear.
 *
 * Branching on `fuelType` is not optional. An EV's `consumption` is kWh/100km
 * and its price is electricity; feeding a petrol price into that row produces a
 * number wrong by roughly a factor of ten.
 */
export function costSoloAud(
  distanceKm: number,
  consumption: number,
  fuelType: FuelType,
  prices: FuelPrices,
): number {
  const perUnit =
    fuelType === "electric" ? ELECTRICITY_PRICE_PER_KWH : prices[fuelType];
  return distanceKm * (consumption / 100) * perUnit;
}

/**
 * Each paying rider's share of the energy cost.
 *
 * The divisor is the passenger count, not the occupant count: the driver was
 * making the trip anyway and the riders are chipping in for the fuel. This
 * follows `CLAUDE.md`'s cost section, which divides cost by passengers while
 * dividing emissions by occupants — the two denominators differ on purpose,
 * because one splits a bill and the other splits a physical quantity.
 */
export function costPerPassengerAud(soloAud: number, passengers: number): number {
  return passengers > 0 ? soloAud / passengers : soloAud;
}

/** The flat myki fare. Every campus falls inside the metro network. */
export function costTransitAud(isConcession: boolean): number {
  return isConcession ? MYKI_FARE.concession : MYKI_FARE.full;
}
