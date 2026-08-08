"use server";

import { redirect } from "next/navigation";

/**
 * Booking mutations.
 *
 * Server Actions rather than client `fetch` calls. The reason is not style: a
 * booking must atomically decrement `available_seats`, so the write has to be a
 * single server-side call into the Supabase RPC that holds the row lock. Routing
 * it through a Server Action means the browser never holds a token, the form
 * works before JavaScript loads, and there is one code path for both.
 *
 * SECURITY: a Server Action is reachable by direct POST, not only through the
 * form that renders it. Every function here must verify the caller's Clerk
 * session and their right to the resource *inside the function* — the fact that
 * the UI only shows the button to an eligible user is not a check.
 *
 * These are wired to the UI and deliberately not yet implemented against the
 * API: the endpoints they call do not exist. Each one names the endpoint it
 * will call so the wiring is a body swap, not a redesign.
 */

/**
 * `POST /bookings` — books a seat and atomically decrements available seats.
 *
 * On success the backend returns the booking, including the driver's phone
 * number, which is the moment contact details unlock.
 */
export async function bookSeat(formData: FormData): Promise<void> {
  const rideId = formData.get("rideId");
  if (typeof rideId !== "string" || rideId.length === 0) {
    throw new Error("bookSeat: missing rideId");
  }

  // TODO(backend): verify the Clerk session, then
  //   POST {API}/api/v1/bookings { ride_id: rideId }
  // and handle RideFullError (409) by re-rendering the ride with a message.
  // Until the endpoint exists this resolves to the fixture booking so the
  // confirmation screen is reachable end to end.
  const bookingId = "bkg-1";

  // `revalidatePath("/rides")` belongs here once the data is real — the seat
  // count on the search page is stale the instant this succeeds.

  redirect(`/bookings/${bookingId}`);
}

/** `DELETE /bookings/{booking_id}` — cancels and restores the seat. */
export async function cancelBooking(formData: FormData): Promise<void> {
  const bookingId = formData.get("bookingId");
  if (typeof bookingId !== "string" || bookingId.length === 0) {
    throw new Error("cancelBooking: missing bookingId");
  }

  // TODO(backend): verify the session owns this booking, then
  //   DELETE {API}/api/v1/bookings/{bookingId}
  redirect("/trips");
}
