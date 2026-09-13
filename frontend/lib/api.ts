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
