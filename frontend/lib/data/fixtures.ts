import type {
  Accessory,
  Booking,
  DriverPreview,
  PointsLedgerEntry,
  Ride,
  TransitLeg,
  User,
  Vehicle,
  VehicleReference,
} from "@/lib/types";
import type { FuelPrices } from "@/lib/emissions";

/**
 * Sample data.
 *
 * Raw entities only — nothing derived. Every CO2 figure, cost and point total
 * the UI shows is computed in `queries.ts` from `lib/emissions.ts`, so the
 * numbers on screen are the ones the documented formulas actually produce.
 *
 * That is a deliberate departure from the wireframes, whose figures are
 * placeholder sketch data and do not satisfy the formulas (its "$2.10 each" for
 * a 10.4 km hybrid trip is roughly four times the fuel cost, for instance).
 * The wireframes specify layout and information architecture; the arithmetic
 * comes from CLAUDE.md.
 *
 * Dates are anchored to the week of Monday 10 August 2026 and written with an
 * explicit +10:00 (AEST) offset so they do not shift with the runner's zone.
 */

/* ── People ───────────────────────────────────────────────────────────────── */

/** The signed-in user. Stands in for whatever Clerk returns after `/users/sync`. */
export const currentUser: User = {
  id: "usr-alex",
  clerkId: "user_2fixture000000000000000",
  email: "anguy0031@student.monash.edu",
  phone: "0431 002 118",
  fullName: "Alex Nguyen",
  role: "both",
  isConcession: true,
  // A spendable balance, not a lifetime total: it diverges from
  // `totalCo2SavedKg x 100` the moment the first accessory is bought.
  greenPoints: 1240,
  joinedAt: "2026-03-02T09:12:00+11:00",
};

export const drivers: Record<string, DriverPreview> = {
  "usr-priya": {
    id: "usr-priya",
    displayName: "Priya K.",
    avatarUrl: null,
    completedRides: 12,
    verified: true,
  },
  "usr-daniel": {
    id: "usr-daniel",
    displayName: "Daniel N.",
    avatarUrl: null,
    completedRides: 31,
    verified: true,
  },
  "usr-sam": {
    id: "usr-sam",
    displayName: "Sam O.",
    avatarUrl: null,
    completedRides: 4,
    verified: true,
  },
  "usr-mei": {
    id: "usr-mei",
    displayName: "Mei L.",
    avatarUrl: null,
    completedRides: 9,
    verified: true,
  },
  "usr-alex": {
    id: "usr-alex",
    displayName: "Alex N.",
    avatarUrl: null,
    completedRides: 18,
    verified: true,
  },
};

/** Phone numbers, revealed only after a booking is confirmed. */
export const driverPhones: Record<string, string> = {
  "usr-priya": "0412 345 678",
  "usr-daniel": "0421 887 004",
  "usr-sam": "0455 190 233",
  "usr-mei": "0498 776 010",
};

/* ── Vehicles ─────────────────────────────────────────────────────────────── */

export const vehicles: Record<string, Vehicle> = {
  "veh-priya": {
    id: "veh-priya",
    ownerId: "usr-priya",
    make: "Toyota",
    model: "Corolla Hybrid",
    year: 2022,
    fuelType: "hybrid",
    fuelConsumption: 4.6,
  },
  "veh-daniel": {
    id: "veh-daniel",
    ownerId: "usr-daniel",
    make: "MG",
    model: "ZS EV",
    year: 2023,
    fuelType: "electric",
    // kWh/100km, not litres. MG is one of the brands absent from the Canadian
    // reference data, so this row could only have been entered by hand.
    fuelConsumption: 17.0,
  },
  "veh-sam": {
    id: "veh-sam",
    ownerId: "usr-sam",
    make: "Mazda",
    model: "3",
    year: 2019,
    fuelType: "petrol",
    fuelConsumption: 6.6,
  },
  "veh-mei": {
    id: "veh-mei",
    ownerId: "usr-mei",
    make: "Hyundai",
    model: "i30",
    year: 2021,
    fuelType: "petrol",
    fuelConsumption: 7.4,
  },
  "veh-alex-corolla": {
    id: "veh-alex-corolla",
    ownerId: "usr-alex",
    make: "Toyota",
    model: "Corolla Hybrid",
    year: 2022,
    fuelType: "hybrid",
    fuelConsumption: 4.6,
  },
  "veh-alex-kona": {
    id: "veh-alex-kona",
    ownerId: "usr-alex",
    make: "Hyundai",
    model: "Kona Electric",
    year: 2023,
    fuelType: "electric",
    // The signed-in user owns one liquid-fuel car and one EV on purpose: the
    // post-a-drive preview then exercises both cost branches, which is where a
    // L/100km-vs-kWh/100km mix-up would surface.
    fuelConsumption: 16.8,
  },
};

/* ── Routes ───────────────────────────────────────────────────────────────── */

/**
 * `campus_routes` rows, keyed `"{origin}:{destination}:{mode}"`.
 * Directional — Clayton->Caulfield and Caulfield->Clayton are separate entries
 * because timetables and drive durations differ by direction.
 */
export const driveRoutes: Record<string, { distanceKm: number; durationMin: number }> =
  {
    "clayton:caulfield": { distanceKm: 10.4, durationMin: 24 },
    "caulfield:clayton": { distanceKm: 10.6, durationMin: 26 },
    "clayton:peninsula": { distanceKm: 45.2, durationMin: 41 },
    "peninsula:clayton": { distanceKm: 45.4, durationMin: 44 },
    "clayton:city": { distanceKm: 22.1, durationMin: 34 },
    "city:clayton": { distanceKm: 22.4, durationMin: 38 },
  };

/**
 * Transit legs per route. `co2Kg` is left at 0 here and filled in by the query
 * layer from `TRANSIT_FACTORS`, so a leg's emissions can never disagree with
 * its distance.
 */
export const transitRoutes: Record<
  string,
  { durationMin: number; changes: number; legs: TransitLeg[] }
> = {
  "clayton:caulfield": {
    durationMin: 48,
    changes: 2,
    legs: [
      { mode: "walk", distanceKm: 0.4, durationMin: 6, line: null, co2Kg: 0 },
      { mode: "bus", distanceKm: 1.9, durationMin: 9, line: "601", co2Kg: 0 },
      {
        mode: "train",
        distanceKm: 9.1,
        durationMin: 24,
        line: "Cranbourne line",
        co2Kg: 0,
      },
      { mode: "walk", distanceKm: 0.5, durationMin: 9, line: null, co2Kg: 0 },
    ],
  },
  "caulfield:clayton": {
    durationMin: 51,
    changes: 2,
    legs: [
      { mode: "walk", distanceKm: 0.5, durationMin: 8, line: null, co2Kg: 0 },
      {
        mode: "train",
        distanceKm: 9.1,
        durationMin: 25,
        line: "Cranbourne line",
        co2Kg: 0,
      },
      { mode: "bus", distanceKm: 1.9, durationMin: 12, line: "601", co2Kg: 0 },
      { mode: "walk", distanceKm: 0.4, durationMin: 6, line: null, co2Kg: 0 },
    ],
  },
};

/* ── Rides ────────────────────────────────────────────────────────────────── */

export const rides: Ride[] = [
  {
    id: "ride-1",
    driverId: "usr-priya",
    vehicleId: "veh-priya",
    origin: "clayton",
    destination: "caulfield",
    departureAt: "2026-08-10T08:15:00+10:00",
    totalSeats: 3,
    availableSeats: 2,
    distanceKm: 10.4,
    status: "open",
    co2Saved: null,
    pointsEarned: null,
  },
  {
    id: "ride-2",
    driverId: "usr-daniel",
    vehicleId: "veh-daniel",
    origin: "clayton",
    destination: "caulfield",
    departureAt: "2026-08-10T08:40:00+10:00",
    totalSeats: 3,
    availableSeats: 1,
    distanceKm: 10.4,
    status: "open",
    co2Saved: null,
    pointsEarned: null,
  },
  {
    id: "ride-3",
    driverId: "usr-sam",
    vehicleId: "veh-sam",
    origin: "clayton",
    destination: "caulfield",
    departureAt: "2026-08-10T09:05:00+10:00",
    totalSeats: 3,
    availableSeats: 0,
    distanceKm: 10.4,
    status: "full",
    co2Saved: null,
    pointsEarned: null,
  },
  {
    id: "ride-4",
    driverId: "usr-mei",
    vehicleId: "veh-mei",
    origin: "clayton",
    destination: "caulfield",
    departureAt: "2026-08-10T10:20:00+10:00",
    totalSeats: 4,
    availableSeats: 3,
    distanceKm: 10.4,
    status: "open",
    co2Saved: null,
    pointsEarned: null,
  },
  // Hosted by the signed-in user — drives the "as driver" rows in My trips.
  {
    id: "ride-5",
    driverId: "usr-alex",
    vehicleId: "veh-alex-corolla",
    origin: "caulfield",
    destination: "clayton",
    departureAt: "2026-08-12T16:40:00+10:00",
    totalSeats: 3,
    availableSeats: 1,
    distanceKm: 10.6,
    status: "open",
    co2Saved: null,
    pointsEarned: null,
  },
  // Finished but not yet marked complete: the row that still owes an action.
  {
    id: "ride-6",
    driverId: "usr-alex",
    vehicleId: "veh-alex-corolla",
    origin: "clayton",
    destination: "peninsula",
    departureAt: "2026-08-06T09:00:00+10:00",
    totalSeats: 3,
    availableSeats: 0,
    distanceKm: 45.2,
    status: "in_progress",
    co2Saved: null,
    pointsEarned: null,
  },
  // Completed, so co2Saved and pointsEarned are frozen server-side values.
  {
    id: "ride-7",
    driverId: "usr-priya",
    vehicleId: "veh-priya",
    origin: "clayton",
    destination: "caulfield",
    departureAt: "2026-08-04T08:15:00+10:00",
    totalSeats: 3,
    availableSeats: 1,
    distanceKm: 10.4,
    status: "completed",
    // The ride total, as the backend would have frozen it on completion:
    // co2AvoidedKg(2 passengers, 10.4 km, 1.105 kg solo) = 4.60, x100 = 459.
    co2Saved: 4.6,
    pointsEarned: 459,
  },
];

export const bookings: Booking[] = [
  {
    id: "bkg-1",
    rideId: "ride-1",
    passengerId: "usr-alex",
    status: "confirmed",
    createdAt: "2026-08-07T19:04:00+10:00",
  },
  {
    id: "bkg-2",
    rideId: "ride-7",
    passengerId: "usr-alex",
    status: "completed",
    createdAt: "2026-08-03T21:40:00+10:00",
  },
];

/** Riders on the signed-in user's own ride, for the "2 of 3 seats booked" line. */
export const ridersByRide: Record<string, string[]> = {
  "ride-5": ["Mei L.", "Sam O."],
  "ride-6": ["Mei L.", "Sam O.", "Daniel N."],
};

export const pickupPoints: Record<string, string> = {
  "ride-1": "Clayton Bus Loop, bay 3",
  "ride-2": "Clayton Halls",
  "ride-4": "Clayton Bus Loop, bay 1",
  "ride-5": "Caulfield Green",
};

export const rideNotes: Record<string, string> = {
  "ride-1": "Leaving on time — no food in the car please.",
};

/* ── Prices ───────────────────────────────────────────────────────────────── */

/**
 * Latest row per fuel type from `fuel_prices`, written daily by the Servo Saver
 * job. Hybrids burn petrol, so they read the petrol price.
 */
export const fuelPrices: FuelPrices = {
  petrol: 1.92,
  diesel: 2.05,
  hybrid: 1.92,
};

/* ── Rewards ──────────────────────────────────────────────────────────────── */

export const totalCo2SavedKg = 12.4;

export const pointsLedger: PointsLedgerEntry[] = [
  {
    id: "led-1",
    label: "Clayton → Peninsula",
    occurredAt: "2026-08-06T09:00:00+10:00",
    delta: 210,
  },
  {
    id: "led-2",
    label: "Clayton → Caulfield",
    occurredAt: "2026-08-04T08:15:00+10:00",
    delta: 96,
  },
  {
    id: "led-3",
    label: "Bought: Leaf badge",
    occurredAt: "2026-08-04T20:11:00+10:00",
    delta: -300,
  },
];

/**
 * Shop catalog. Prices are set against roughly 500-2,500 points per ride, per
 * CLAUDE.md — the proposal's ~200-point formula was recalibrated along with the
 * stage thresholds, so accessories had to move with it.
 */
export const accessories: Accessory[] = [
  {
    id: "acc-scarf",
    name: "Scarf",
    description: "Wool, for the walk from the car park.",
    category: "clothing",
    cost: 500,
    requiredStage: "egg",
    imageUrl: "/pet/scarf.svg",
  },
  {
    id: "acc-cap",
    name: "Cap",
    description: "Sage green, slightly too big.",
    category: "headwear",
    cost: 800,
    requiredStage: "egg",
    imageUrl: "/pet/cap.svg",
  },
  {
    id: "acc-leaf",
    name: "Leaf badge",
    description: "Earned the hard way.",
    category: "held_item",
    cost: 300,
    requiredStage: "egg",
    imageUrl: "/pet/leaf.svg",
  },
  {
    id: "acc-goggles",
    name: "Goggles",
    description: "For headwinds.",
    category: "eyewear",
    cost: 1200,
    requiredStage: "hatched",
    imageUrl: "/pet/goggles.svg",
  },
  {
    id: "acc-wings",
    name: "Wings",
    description: "Purely decorative.",
    category: "clothing",
    cost: 2500,
    requiredStage: "juvenile",
    imageUrl: "/pet/wings.svg",
  },
  {
    id: "acc-aurora",
    name: "Aurora",
    description: "A sky that follows you around.",
    category: "background",
    cost: 6000,
    requiredStage: "adult",
    imageUrl: "/pet/aurora.svg",
  },
];

/** Accessory ids the user already owns, and which one is worn. */
export const ownedAccessoryIds = ["acc-leaf"];
export const equippedAccessoryIds = ["acc-leaf"];

/* ── Vehicle reference ────────────────────────────────────────────────────── */

/**
 * A slice of `vehicle_reference`, the NRCan-derived lookup behind
 * `GET /vehicles/reference`. Intentionally contains no MG, BYD, GWM or LDV —
 * the source data is Canadian and those brands are genuinely missing, which is
 * the whole reason the registration screen must keep manual entry reachable.
 */
export const vehicleReference: VehicleReference[] = [
  {
    id: 1,
    make: "Toyota",
    model: "Corolla Hybrid",
    year: 2022,
    fuelType: "hybrid",
    engineSize: 1.8,
    avgConsumption: 4.6,
  },
  {
    id: 2,
    make: "Toyota",
    model: "Corolla",
    year: 2019,
    fuelType: "petrol",
    engineSize: 2.0,
    avgConsumption: 6.7,
  },
  {
    id: 3,
    make: "Toyota",
    model: "Corolla Cross",
    year: 2023,
    fuelType: "hybrid",
    engineSize: 2.0,
    avgConsumption: 4.3,
  },
  {
    id: 4,
    make: "Toyota",
    model: "RAV4",
    year: 2023,
    fuelType: "hybrid",
    engineSize: 2.5,
    avgConsumption: 4.8,
  },
  {
    id: 5,
    make: "Mazda",
    model: "3",
    year: 2019,
    fuelType: "petrol",
    engineSize: 2.0,
    avgConsumption: 6.6,
  },
  {
    id: 6,
    make: "Mazda",
    model: "CX-5",
    year: 2021,
    fuelType: "petrol",
    engineSize: 2.5,
    avgConsumption: 7.9,
  },
  {
    id: 7,
    make: "Hyundai",
    model: "i30",
    year: 2021,
    fuelType: "petrol",
    engineSize: 2.0,
    avgConsumption: 7.4,
  },
  {
    id: 8,
    make: "Hyundai",
    model: "Kona Electric",
    year: 2023,
    fuelType: "electric",
    engineSize: null,
    avgConsumption: 16.8,
  },
  {
    id: 9,
    make: "Volkswagen",
    model: "Golf",
    year: 2020,
    fuelType: "petrol",
    engineSize: 1.4,
    avgConsumption: 6.4,
  },
  {
    id: 10,
    make: "Ford",
    model: "Focus",
    year: 2018,
    fuelType: "diesel",
    engineSize: 2.0,
    avgConsumption: 5.4,
  },
];

/** kg CO2 avoided per week, oldest first, for the home dashboard sparkline. */
export const weeklyCo2Kg = [0.9, 1.4, 0.0, 2.2, 1.8, 2.6, 1.1, 2.4];
