/**
 * The one place the browser talks to the FastAPI backend.
 *
 * Every request goes through `apiFetch`, so the base URL, the `/api/v1` prefix,
 * the bearer header and the error shape are decided once. Endpoint wrappers
 * below stay thin: a URL, a query string, and a return type.
 *
 * Types mirror the Pydantic response models exactly, snake_case included. The
 * boundary is where the backend's naming lives; components map it into their
 * own shape rather than pretending the wire format is camelCase.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL;

export type FuelType = "petrol" | "diesel" | "hybrid" | "electric";
export type Campus =
  | "clayton"
  | "caulfield"
  | "peninsula"
  | "parkville"
  | "city";
export type UserRole = "passenger" | "driver" | "both";

/** backend/app/schemas/vehicle.py :: VehicleReference */
export interface VehicleReference {
  id: number;
  make: string;
  model: string;
  year: number;
  fuel_type: FuelType;
  engine_size: number | null;
  /**
   * kWh/100km for electric, L/100km otherwise. Never do arithmetic with this
   * without branching on `fuel_type` first - the two units differ by about a
   * factor of ten and nothing in the number itself says which it is.
   */
  avg_consumption: number;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ApiOptions extends Omit<RequestInit, "headers"> {
  /**
   * A Clerk session token. `null` is allowed so a caller can hand through
   * whatever `getToken()` returned; the request is still sent and the backend
   * answers 401, which is the same outcome as an expired one and keeps the
   * error handling in a single place.
   */
  token: string | null;
}

/** FastAPI errors are `{"detail": "..."}`; anything else falls back to status text. */
async function errorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body?.detail === "string") return body.detail;
  } catch {
    // not JSON, or an empty body - the status text below is all we have
  }
  return response.statusText || `request failed with ${response.status}`;
}

export async function apiFetch<T>(
  path: string,
  { token, ...init }: ApiOptions,
): Promise<T> {
  if (!BASE_URL) {
    throw new ApiError(0, "NEXT_PUBLIC_API_URL is not set");
  }

  const response = await fetch(`${BASE_URL}/api/v1${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    throw new ApiError(response.status, await errorMessage(response));
  }

  return (await response.json()) as T;
}

export interface VehicleSearchQuery {
  make: string;
  model?: string;
  year?: number;
}

/**
 * GET /vehicles/reference - partial, case-insensitive match on make and model,
 * newest year first, capped at 20 rows by the backend.
 *
 * `make` and `model` are separate columns there, so they have to be separate
 * arguments here. Sending "Toyota Corolla" as the make matches nothing.
 */
export function searchVehicleReference(
  { make, model, year }: VehicleSearchQuery,
  options: ApiOptions,
): Promise<VehicleReference[]> {
  const params = new URLSearchParams({ make });
  if (model) params.set("model", model);
  if (year) params.set("year", String(year));

  return apiFetch<VehicleReference[]>(
    `/vehicles/reference?${params.toString()}`,
    options,
  );
}

/** The unit `avg_consumption` and `fuel_consumption` are quoted in. */
export function consumptionUnit(fuelType: FuelType | ""): string {
  return fuelType === "electric" ? "kWh/100km" : "L/100km";
}

/** backend/app/schemas/user.py :: UserResponse. clerk_id is deliberately absent. */
export interface User {
  id: string;
  email: string;
  phone: string;
  full_name: string;
  role: UserRole;
  is_concession: boolean;
  /** null until onboarding finishes - this is what marks a profile complete. */
  home_campus: Campus | null;
  green_points: number;
  joined_at: string;
}

/**
 * The five campuses, as the backend's CAMPUS enum spells them alongside what a
 * person reads. Same value/label split as the fuel types: the wire value is
 * stored, so nothing has to be translated at request time.
 */
export const CAMPUS_OPTIONS: readonly { value: Campus; label: string }[] = [
  { value: "clayton", label: "Clayton" },
  { value: "caulfield", label: "Caulfield" },
  { value: "peninsula", label: "Peninsula" },
  { value: "parkville", label: "Parkville" },
  { value: "city", label: "City (Docklands)" },
];

export function campusLabel(value: Campus | null): string {
  return CAMPUS_OPTIONS.find((option) => option.value === value)?.label ?? "";
}

/** backend/app/schemas/vehicle.py :: VehicleResponse */
export interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  fuel_type: FuelType;
  fuel_consumption: number;
  created_at: string;
}

/**
 * POST /users/sync - idempotent. Creates the users row and its rewards row on
 * the first call and returns the existing one after that, so it is safe to call
 * on every page load, which is exactly what the frontend does.
 */
export function syncUser(options: ApiOptions): Promise<User> {
  return apiFetch<User>("/users/sync", { ...options, method: "POST" });
}

/** PATCH /users/me - partial. Only the keys present are written. */
export interface UserUpdate {
  phone?: string;
  is_concession?: boolean;
  home_campus?: Campus;
}

export function updateProfile(
  changes: UserUpdate,
  options: ApiOptions,
): Promise<User> {
  return apiFetch<User>("/users/me", {
    ...options,
    method: "PATCH",
    body: JSON.stringify(changes),
  });
}

/**
 * POST /vehicles. Every field is required even when `reference_id` is set - the
 * backend uses the reference row's values and ignores the rest, but the body
 * still has to validate. Registering a vehicle also promotes the owner from
 * 'passenger' to 'driver'.
 */
export interface VehicleCreate {
  make: string;
  model: string;
  year: number;
  fuel_type: FuelType;
  fuel_consumption: number;
  reference_id?: number | null;
}

export function createVehicle(
  payload: VehicleCreate,
  options: ApiOptions,
): Promise<Vehicle> {
  return apiFetch<Vehicle>("/vehicles", {
    ...options,
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type RideStatus = "open" | "full" | "in_progress" | "completed" | "cancelled";
export type BookingStatus = "confirmed" | "cancelled" | "completed";

/** backend/app/schemas/ride.py :: RideResponse. What search returns. */
export interface Ride {
  id: string;
  driver_id: string;
  vehicle_id: string;
  origin: Campus;
  destination: Campus;
  /** UTC. Format with lib/time.ts, never bare toLocale*(). */
  departure_at: string;
  total_seats: number;
  available_seats: number;
  distance_km: number;
  status: RideStatus;
  /**
   * Null until the driver marks the ride complete. Null means "not finished",
   * never zero - a solo ride legitimately avoids 0.00 kg.
   */
  co2_saved: number | null;
  points_earned: number | null;
  created_at: string;
}

/**
 * backend/app/schemas/ride.py :: RideDriver / RideDriverContact.
 *
 * `phone` is present only when the caller holds a confirmed booking on the
 * ride - the backend picks between two response models, and the field does
 * not exist on the other. So `"phone" in driver` is the booking check.
 */
export interface RideDriver {
  id: string;
  full_name: string;
  phone?: string;
}

/** backend/app/schemas/ride.py :: RideDetail. What GET /rides/{id} returns. */
export interface RideDetail extends Ride {
  driver: RideDriver;
  vehicle: Vehicle;
  route_summary: string | null;
}

/** backend/app/schemas/booking.py :: BookingResponse */
export interface Booking {
  id: string;
  ride_id: string;
  status: BookingStatus;
  created_at: string;
}

/**
 * GET /vehicles/me - every car the caller owns, newest first.
 *
 * An empty array is the ordinary answer for someone who has not registered
 * one, not an error, so callers render an empty state rather than a failure.
 */
export function getMyVehicles(options: ApiOptions): Promise<Vehicle[]> {
  return apiFetch<Vehicle[]>("/vehicles/me", options);
}

export interface RideSearch {
  origin: Campus;
  destination: Campus;
  /** A Melbourne calendar date, YYYY-MM-DD. */
  on: string;
}

/** GET /rides/search - open rides with a seat left, earliest first. */
export function searchRides(
  { origin, destination, on }: RideSearch,
  options: ApiOptions,
): Promise<Ride[]> {
  const params = new URLSearchParams({ origin, destination, on });
  return apiFetch<Ride[]>(`/rides/search?${params.toString()}`, options);
}

/**
 * backend/app/schemas/ride.py :: RidePassenger. A confirmed passenger as the
 * driver sees them - the mirror of the driver's phone appearing to a booked
 * passenger. Only the driver is ever given this; anyone else gets a 403.
 */
export interface RidePassenger {
  id: string;
  full_name: string;
  phone: string;
  booking_id: string;
}

/** GET /rides/{id}/passengers - drivers only. */
export function getRidePassengers(rideId: string, options: ApiOptions): Promise<RidePassenger[]> {
  return apiFetch<RidePassenger[]>(`/rides/${rideId}/passengers`, options);
}

/** GET /rides/mine - the caller's own posted rides, soonest departure first, any status. */
export function getMyRides(options: ApiOptions): Promise<Ride[]> {
  return apiFetch<Ride[]>("/rides/mine", options);
}

export function getRide(rideId: string, options: ApiOptions): Promise<RideDetail> {
  return apiFetch<RideDetail>(`/rides/${rideId}`, options);
}

/**
 * POST /rides. No distance and no available_seats: the backend takes distance
 * from the cached route and starts every seat free, and refuses a body that
 * tries to set either.
 */
export interface RideCreate {
  vehicle_id: string;
  origin: Campus;
  destination: Campus;
  /** Must carry a timezone. Build it with toMelbourneInstant. */
  departure_at: string;
  total_seats: number;
}

export function createRide(payload: RideCreate, options: ApiOptions): Promise<Ride> {
  return apiFetch<Ride>("/rides", {
    ...options,
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * POST /bookings - claims a seat, or 409s. The backend's `detail` says which
 * kind of 409: the ride filled, or the caller already holds a seat. They read
 * differently to a passenger, so surface the message rather than the code.
 */
export function createBooking(rideId: string, options: ApiOptions): Promise<Booking> {
  return apiFetch<Booking>("/bookings", {
    ...options,
    method: "POST",
    body: JSON.stringify({ ride_id: rideId }),
  });
}

/** DELETE /bookings/{id} - idempotent; a second cancel is a 200 too. */
export function cancelBooking(bookingId: string, options: ApiOptions): Promise<Booking> {
  return apiFetch<Booking>(`/bookings/${bookingId}`, { ...options, method: "DELETE" });
}

/** GET /bookings/me - newest first, cancelled ones included. */
export function getMyBookings(options: ApiOptions): Promise<Booking[]> {
  return apiFetch<Booking[]>("/bookings/me", options);
}

export type TransitMode = "train" | "bus" | "tram" | "walk";

/** backend/app/schemas/route.py :: TransitLeg. One step of the public transport journey. */
export interface TransitLeg {
  mode: TransitMode;
  distance_km: number;
  duration_min: number;
  /** The service, e.g. "691" or "Cranbourne". Null for a walk. */
  line: string | null;
}

export type CompareMode = "carpool" | "transit" | "private";

/** backend/app/schemas/compare.py :: ModeComparison. One row of the table. */
export interface ModeComparison {
  mode: CompareMode;
  duration_min: number;
  /** Dollars. Per person for carpool and transit; the whole tank for private. */
  cost: number;
  /** Per occupant for carpool; the sum over legs for transit. */
  co2_kg: number;
}

/**
 * backend/app/schemas/compare.py :: ComparisonBase. The same trip three ways,
 * plus the inputs it was computed from, so the screen can say why two
 * comparisons differ. Modes always arrive as carpool, transit, private.
 */
export interface ComparisonBase {
  /** Passengers the carpool cost is split between. */
  riders: number;
  is_concession: boolean;
  /** Dollars per litre, today's median. Null for an electric car. */
  fuel_price: number | null;
  modes: ModeComparison[];
  transit_legs: TransitLeg[] | null;
}

/** backend/app/schemas/compare.py :: Comparison. One posted ride, the driver's own car. */
export interface Comparison extends ComparisonBase {
  ride_id: string;
}

/**
 * backend/app/schemas/compare.py :: RouteEstimate. A campus pair with no ride
 * behind it: the fleet-average petrol car, one passenger, and the routes
 * Google returned for driving and public transport.
 */
export interface RouteEstimate extends ComparisonBase {
  origin: Campus;
  destination: Campus;
  distance_km: number;
  /** L/100km of the assumed car. */
  fuel_consumption: number;
  /** The road taken, e.g. "Monash Fwy/M1". */
  drive_summary: string | null;
  transit_summary: string | null;
}

/**
 * GET /compare/{ride_id}. A 404 also means "no fuel price on record yet" -
 * the daily job has not run - which the page treats as unavailable, not as
 * a broken ride.
 */
export function getComparison(rideId: string, options: ApiOptions): Promise<Comparison> {
  return apiFetch<Comparison>(`/compare/${rideId}`, options);
}

/** GET /compare/route. A rough comparison for a pair nobody has posted a ride on. */
export function getRouteEstimate(
  route: { origin: Campus; destination: Campus },
  options: ApiOptions,
): Promise<RouteEstimate> {
  const params = new URLSearchParams(route);
  return apiFetch<RouteEstimate>(`/compare/route?${params.toString()}`, options);
}

/**
 * A Google Maps directions link between two campuses. Keyless - it opens the
 * Maps site or app, it does not call the API. The addresses mirror
 * CAMPUS_ADDRESSES in backend/app/clients/maps.py, so the link plans the same
 * journey the figures were computed from. If one changes, change both.
 *
 * https://developers.google.com/maps/documentation/urls/get-started#directions-action
 */
const CAMPUS_ADDRESSES: Record<Campus, string> = {
  clayton: "Monash University Clayton Campus, Wellington Rd, Clayton VIC 3800, Australia",
  caulfield:
    "Monash University Caulfield Campus, 900 Dandenong Rd, Caulfield East VIC 3145, Australia",
  peninsula: "Monash University Peninsula Campus, McMahons Rd, Frankston VIC 3199, Australia",
  parkville: "Monash University Parkville Campus, 381 Royal Parade, Parkville VIC 3052, Australia",
  city: "Monash University City Campus, 750 Collins St, Docklands VIC 3008, Australia",
};

export function googleMapsDirections(
  origin: Campus,
  destination: Campus,
  travelmode: "driving" | "transit",
): string {
  const params = new URLSearchParams({
    api: "1",
    origin: CAMPUS_ADDRESSES[origin],
    destination: CAMPUS_ADDRESSES[destination],
    travelmode,
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export type PetStage = "egg" | "hatched" | "juvenile" | "adult" | "legendary";
export type AccessoryCategory =
  | "headwear"
  | "eyewear"
  | "clothing"
  | "background"
  | "held_item";

/** backend/app/schemas/ride.py :: RideCompletion */
export interface RideCompletion {
  ride_id: string;
  co2_saved: number;
  points_earned: number;
  passengers: number;
  /** True when the ride had already been completed. The figures are still real. */
  already_completed: boolean;
}

/**
 * PATCH /rides/{id}/complete - the driver confirms the trip happened, which is
 * what pays everyone on it. Idempotent: a second call answers 200 with the same
 * figures rather than paying twice.
 */
export function completeRide(rideId: string, options: ApiOptions): Promise<RideCompletion> {
  return apiFetch<RideCompletion>(`/rides/${rideId}/complete`, {
    ...options,
    method: "PATCH",
  });
}

/** backend/app/schemas/rewards.py :: RewardsSummary. REQ-013's impact figures. */
export interface RewardsSummary {
  green_points: number;
  total_co2_saved: number;
  pet_stage: PetStage;
  /** Null at 'legendary' - there is nothing above it. */
  next_stage: PetStage | null;
  co2_to_next: number | null;
  /** 0-100 through the current stage. */
  stage_progress: number;
  completed_trips: number;
}

export function getRewards(options: ApiOptions): Promise<RewardsSummary> {
  return apiFetch<RewardsSummary>("/rewards/me", options);
}

/** backend/app/schemas/pet.py :: Accessory */
export interface Accessory {
  id: string;
  name: string;
  description: string | null;
  category: AccessoryCategory;
  cost: number;
  required_stage: PetStage;
  image_url: string;
}

/**
 * A catalogue row as one user sees it. `locked` and affordability are separate
 * on purpose: locked is a pet that has not grown far enough, which no amount of
 * points fixes.
 */
export interface ShopItem extends Accessory {
  owned: boolean;
  equipped: boolean;
  locked: boolean;
}

export interface OwnedAccessory {
  accessory: Accessory;
  equipped: boolean;
  purchased_at: string;
}

/** backend/app/schemas/pet.py :: Pet */
export interface Pet {
  pet_stage: PetStage;
  total_co2_saved: number;
  green_points: number;
  owned: OwnedAccessory[];
}

export function getPet(options: ApiOptions): Promise<Pet> {
  return apiFetch<Pet>("/pet/me", options);
}

/** GET /pet/accessories - the catalogue, cheapest first. */
export function getShop(options: ApiOptions): Promise<ShopItem[]> {
  return apiFetch<ShopItem[]>("/pet/accessories", options);
}

/** POST /pet/accessories/buy - 402 if short of points, 403 if the stage is locked. */
export function buyAccessory(accessoryId: string, options: ApiOptions): Promise<Pet> {
  return apiFetch<Pet>("/pet/accessories/buy", {
    ...options,
    method: "POST",
    body: JSON.stringify({ accessory_id: accessoryId }),
  });
}

/** PUT /pet/accessories/{id}/equip - ownership and balance are untouched. */
export function equipAccessory(
  accessoryId: string,
  equipped: boolean,
  options: ApiOptions,
): Promise<Pet> {
  return apiFetch<Pet>(`/pet/accessories/${accessoryId}/equip`, {
    ...options,
    method: "PUT",
    body: JSON.stringify({ equipped }),
  });
}
