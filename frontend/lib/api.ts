export type FuelType = "petrol" | "diesel" | "hybrid" | "electric";

export type VehicleReference = {
  id: number;
  make: string;
  model: string;
  year: number;
  fuel_type: FuelType;
  engine_size: number | null;
  avg_consumption: number;
};

export type Vehicle = {
  id: string;
  owner_id: string;
  make: string;
  model: string;
  year: number;
  fuel_type: FuelType;
  fuel_consumption: number;
  created_at: string;
};

type ApiError = { detail?: string };

export const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(
  /\/$/,
  "",
);

export async function api<T>(path: string, token?: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${apiUrl}/api/v1${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new Error(
      `Cannot reach the MonashGO API at ${apiUrl}. Check that the backend is running and this web address is allowed by CORS.`,
    );
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiError;
    throw new Error(body.detail ?? `The MonashGO API returned HTTP ${response.status}.`);
  }

  return response.json() as Promise<T>;
}
