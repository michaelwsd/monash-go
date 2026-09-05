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

/**
 * GET /vehicles/me - every car the caller owns, newest first.
 *
 * An empty array is the ordinary answer for someone who has not registered
 * one, not an error, so callers render an empty state rather than a failure.
 */
export function getMyVehicles(options: ApiOptions): Promise<Vehicle[]> {
  return apiFetch<Vehicle[]>("/vehicles/me", options);
}
