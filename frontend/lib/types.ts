/**
 * Domain types.
 *
 * The enums and entity shapes mirror `CLAUDE.md`'s database schema one-for-one,
 * so a response from the FastAPI backend can be assigned straight to them once
 * the endpoints land. Types that exist only to feed a screen (the "view models"
 * at the bottom) are kept separate and named for the endpoint that will return
 * them, so it stays obvious which shapes are the contract and which are ours.
 */

/* ── Enums ────────────────────────────────────────────────────────────────── */

export type UserRole = "passenger" | "driver" | "both";
export type FuelType = "petrol" | "diesel" | "hybrid" | "electric";
export type Campus = "clayton" | "caulfield" | "peninsula" | "parkville" | "city";
export type RideStatus = "open" | "full" | "in_progress" | "completed" | "cancelled";
export type BookingStatus = "confirmed" | "cancelled" | "completed";
export type PetStage = "egg" | "hatched" | "juvenile" | "adult" | "legendary";
export type AccessoryCategory =
  | "headwear"
  | "eyewear"
  | "clothing"
  | "background"
  | "held_item";
export type TravelMode = "drive" | "transit";
export type TransitMode = "train" | "bus" | "tram" | "walk";

/** Ordered so progress between stages can be computed by index. */
export const PET_STAGES: readonly PetStage[] = [
  "egg",
  "hatched",
  "juvenile",
  "adult",
  "legendary",
] as const;

/**
 * Cumulative kg CO2 avoided required to reach each stage.
 * Source: CLAUDE.md "Pet Stage Thresholds", which supersedes the proposal.
 * Duplicated here only for progress-bar arithmetic; the backend remains the
 * authority for the stage a user is actually in.
 */
export const PET_STAGE_THRESHOLDS: Record<PetStage, number> = {
  egg: 0,
  hatched: 15,
  juvenile: 60,
  adult: 200,
  legendary: 800,
};

export const CAMPUSES: readonly Campus[] = [
  "clayton",
  "caulfield",
  "peninsula",
  "parkville",
  "city",
] as const;

export const FUEL_TYPES: readonly FuelType[] = [
  "petrol",
  "diesel",
  "hybrid",
  "electric",
] as const;

/* ── Entities ─────────────────────────────────────────────────────────────── */

export interface User {
  id: string;
  clerkId: string;
  email: string;
  phone: string;
  fullName: string;
  role: UserRole;
  /** Drives which myki fare the comparison uses. Seeded from the email domain. */
  isConcession: boolean;
  greenPoints: number;
  joinedAt: string;
}

export interface Vehicle {
  id: string;
  ownerId: string;
  make: string;
  model: string;
  year: number;
  fuelType: FuelType;
  /** L/100km for petrol, diesel and hybrid; kWh/100km for electric. */
  fuelConsumption: number;
}

export interface Ride {
  id: string;
  driverId: string;
  vehicleId: string;
  origin: Campus;
  destination: Campus;
  /** ISO 8601. Rendered in Australia/Melbourne. */
  departureAt: string;
  totalSeats: number;
  availableSeats: number;
  distanceKm: number;
  status: RideStatus;
  /** Both are null until the ride transitions to `completed`. */
  co2Saved: number | null;
  pointsEarned: number | null;
}

export interface Booking {
  id: string;
  rideId: string;
  passengerId: string;
  status: BookingStatus;
  createdAt: string;
}

export interface Reward {
  userId: string;
  petStage: PetStage;
  totalCo2Saved: number;
  milestone: number;
}

export interface Accessory {
  id: string;
  name: string;
  description: string | null;
  category: AccessoryCategory;
  cost: number;
  requiredStage: PetStage;
  imageUrl: string;
}

export interface OwnedAccessory {
  id: string;
  accessory: Accessory;
  equipped: boolean;
  purchasedAt: string;
}

/** One row of the NRCan-derived lookup behind `GET /vehicles/reference`. */
export interface VehicleReference {
  id: number;
  make: string;
  model: string;
  year: number;
  fuelType: FuelType;
  engineSize: number | null;
  /** Units follow `fuelType` — see `Vehicle.fuelConsumption`. */
  avgConsumption: number;
}

/* ── View models ──────────────────────────────────────────────────────────── */

/** The driver fields a passenger may see before booking. No phone number. */
export interface DriverPreview {
  id: string;
  /** "Priya K." — surname reduced to an initial until a booking exists. */
  displayName: string;
  avatarUrl: string | null;
  completedRides: number;
  verified: boolean;
}

/** The driver fields unlocked once a booking is confirmed. */
export interface DriverContact extends DriverPreview {
  phone: string;
}

/** A row in the search results: `GET /rides/search`. */
export interface RideSummary {
  ride: Ride;
  driver: DriverPreview;
  vehicle: Vehicle;
  durationMin: number;
  /** Per-passenger CO2 for this ride, kg. */
  co2PerPersonKg: number;
  /** Per-passenger share of fuel or electricity, AUD. */
  costPerPersonAud: number;
  /** kg CO2 this passenger avoids versus driving the trip alone. */
  co2AvoidedKg: number;
  pickupPoint: string | null;
}

/** One step of a transit route, from `campus_routes.legs`. */
export interface TransitLeg {
  mode: TransitMode;
  distanceKm: number;
  durationMin: number;
  line: string | null;
  co2Kg: number;
}

/** One column of the comparison dashboard. */
export interface CompareOption {
  mode: "carpool" | "transit" | "solo";
  label: string;
  co2Kg: number;
  costAud: number;
  durationMin: number;
  /** Short qualifiers under the headline number, e.g. "3 riders", "2 changes". */
  detail: string[];
}

/** `GET /compare/{ride_id}`. */
export interface Comparison {
  rideId: string;
  distanceKm: number;
  options: CompareOption[];
  transitLegs: TransitLeg[];
  /** Concession vs full myki, so the page can state which fare it used. */
  fare: "concession" | "full";
}

/** Full ride page: `GET /rides/{ride_id}` plus its comparison. */
export interface RideDetail extends RideSummary {
  comparison: Comparison;
  note: string | null;
  /**
   * The reader's own booking on this ride, if they already have one.
   *
   * Not decoration: its presence changes the arithmetic. A prospective rider is
   * counted as an extra occupant when quoting "what would this cost me?", but
   * someone already aboard is inside the existing count, and quoting them a
   * cheaper split than their confirmation showed is a bug.
   */
  viewerBookingId: string | null;
}

/** A row in "My trips": one booking or one hosted ride, flattened. */
export interface Trip {
  id: string;
  role: "driver" | "passenger";
  ride: Ride;
  /** The other party — the driver for a passenger, a rider count for a driver. */
  counterparty: string;
  bookingStatus: BookingStatus | null;
  co2AvoidedKg: number | null;
  costAud: number | null;
  pointsEarned: number | null;
}

/** A confirmed booking with the contact details it unlocked. */
export interface BookingConfirmation {
  booking: Booking;
  ride: Ride;
  driver: DriverContact;
  vehicle: Vehicle;
  pickupPoint: string | null;
  arriveByAt: string;
  co2AvoidedKg: number;
  costAud: number;
  pendingPoints: number;
}

/**
 * A line in the pet page's points ledger.
 *
 * NOTE: there is no ledger table in the schema — points are a single integer on
 * `users`. Wireframe 1k shows a per-event history, which needs either a new
 * table or a derived view over rides and purchases. Rendered here from a
 * fixture; see the gap list in the handover notes.
 */
export interface PointsLedgerEntry {
  id: string;
  label: string;
  occurredAt: string;
  /** Positive for earned, negative for spent. */
  delta: number;
}

/** `GET /rewards/me` plus what the pet page needs to draw progress. */
export interface RewardsSummary {
  greenPoints: number;
  petName: string;
  stage: PetStage;
  totalCo2SavedKg: number;
  /** null once the pet is legendary. */
  nextStage: PetStage | null;
  nextStageAtKg: number | null;
  ledger: PointsLedgerEntry[];
}

/** Aggregates behind the home dashboard's impact card. */
export interface ImpactSummary {
  co2AvoidedKg: number;
  sharedTrips: number;
  moneySavedAud: number;
  /** kg avoided per week, oldest first. Eight entries. */
  weeklyCo2Kg: number[];
}
