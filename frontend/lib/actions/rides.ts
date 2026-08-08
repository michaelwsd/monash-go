"use server";

import { redirect } from "next/navigation";

/**
 * Ride mutations. See `lib/actions/bookings.ts` for why these are Server
 * Actions and for the standing rule that each one must authenticate its caller
 * inside the function body.
 */

/** `POST /rides` — creates a ride offer. */
export async function postDrive(formData: FormData): Promise<void> {
  const required = ["origin", "destination", "date", "time", "seats", "vehicleId"];
  for (const field of required) {
    if (!formData.get(field)) throw new Error(`postDrive: missing ${field}`);
  }

  // TODO(backend): verify the Clerk session, confirm the vehicle belongs to the
  // caller, then POST {API}/api/v1/rides with departure_at built from date+time
  // in Australia/Melbourne. `distance_km` is resolved server-side from
  // campus_routes so a client cannot understate a trip to inflate its rating.
  redirect("/trips");
}

/**
 * Marks a finished ride complete, which is what triggers the reward.
 *
 * There is no endpoint for this yet — see the gap list. It matters more than it
 * looks: `co2_saved` and `points_earned` are written on this transition and only
 * on this transition, so without it no user ever earns a point.
 */
export async function markRideComplete(formData: FormData): Promise<void> {
  const rideId = formData.get("rideId");
  if (typeof rideId !== "string" || rideId.length === 0) {
    throw new Error("markRideComplete: missing rideId");
  }

  // TODO(backend): needs PATCH /rides/{ride_id}/status or similar. Only the
  // driver may call it, and it must be idempotent — a double submit must not
  // award points twice.
  redirect("/trips?tab=past");
}
