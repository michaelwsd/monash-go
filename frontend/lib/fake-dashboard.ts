/**
 * PLACEHOLDER DATA - not real, not fetched, not persisted.
 *
 * Every number here is copied from artboard 1f of "MonashGo Wireframes v2" so
 * the dashboard looks like the design while the API is still being built.
 *
 * Delete this file when the real endpoints exist. The pieces map to:
 *   nextTrip   -> GET /bookings/me   (soonest confirmed booking)
 *   impact     -> GET /rewards/me
 *   rewards    -> GET /rewards/me
 *   weeklyCo2  -> not yet specified; would need a per-week aggregate
 */

export type NextTrip = {
  when: string;
  departsAt: string;
  origin: string;
  destination: string;
  driver: string;
  vehicle: string;
  meetingPoint: string;
};

export const nextTrip: NextTrip = {
  when: "tomorrow",
  departsAt: "08:15",
  origin: "Clayton",
  destination: "Caulfield",
  driver: "Priya K.",
  vehicle: "Corolla Hybrid",
  meetingPoint: "Bus Loop bay 3",
};

export const impact = {
  co2AvoidedKg: 12.4,
  sharedTrips: 18,
  dollarsSaved: 61,
};

export const rewards = {
  greenPoints: 1240,
  pointsToNextStage: 260,
  /** Progress through the current pet stage, 0-100. Design shows 64%. */
  stageProgressPercent: 64,
};

/** CO2 avoided per week, kg, oldest week first. Eight weeks, per the design. */
export const weeklyCo2Kg = [0.9, 1.4, 1.1, 2.2, 1.8, 2.6, 2.1, 3.1];

export type SuggestedRide = {
  id: string;
  departsAt: string;
  durationMin: number;
  driver: string;
  vehicle: string;
  route: string;
  seatsLeft: number;
  totalSeats: number;
  co2PerPersonKg: number;
  costPerPerson: number;
  co2SavedKg: number;
};

/** Ride cards, copied from artboard 1a. Would come from GET /rides/search. */
export const suggestedRides: SuggestedRide[] = [
  {
    id: "r1",
    departsAt: "08:15",
    durationMin: 24,
    driver: "Priya K.",
    vehicle: "Toyota Corolla Hybrid",
    route: "Clayton Bus Loop → Caulfield Green",
    seatsLeft: 2,
    totalSeats: 3,
    co2PerPersonKg: 0.32,
    costPerPerson: 2.1,
    co2SavedKg: 0.64,
  },
  {
    id: "r2",
    departsAt: "08:40",
    durationMin: 22,
    driver: "Daniel N.",
    vehicle: "MG ZS EV",
    route: "Clayton Halls → Caulfield Station",
    seatsLeft: 1,
    totalSeats: 4,
    co2PerPersonKg: 0,
    costPerPerson: 0.9,
    co2SavedKg: 1.28,
  },
  {
    id: "r3",
    departsAt: "09:05",
    durationMin: 26,
    driver: "Sam O.",
    vehicle: "Mazda 3",
    route: "Clayton Bus Loop → Caulfield Green",
    seatsLeft: 0,
    totalSeats: 3,
    co2PerPersonKg: 0.51,
    costPerPerson: 2.8,
    co2SavedKg: 0.51,
  },
];

/**
 * The carpool / transit / private-car comparison from requirement 4, for the
 * next trip above. Would come from GET /compare/{ride_id}.
 */
export const comparison = [
  { mode: "Carpool", minutes: 24, cost: 2.1, co2Kg: 0.32, best: true },
  { mode: "Public transport", minutes: 47, cost: 2.85, co2Kg: 0.41, best: false },
  { mode: "Drive alone", minutes: 22, cost: 6.3, co2Kg: 0.96, best: false },
];
