"use client";

import { getMyBookings, getRide, holdsSeat, type Booking, type RideDetail } from "@/lib/api";
import { isUpcoming } from "@/lib/time";
import { useQuery, type QueryState } from "@/lib/use-query";

export interface Trip {
  booking: Booking;
  ride: RideDetail;
}

/**
 * The caller's bookings, each resolved to its ride.
 *
 * GET /bookings/me returns ride ids and nothing else, so each one is followed
 * to GET /rides/{id}. That is one request per booking, which is fine here: it
 * is bounded by how many trips one person has, not by a search result.
 *
 * Confirmed and completed bookings. A cancelled one has no seat and no trip,
 * but a completed one is a trip that happened - it is the row that shows what
 * the trip earned, so dropping it would hide every reward the user has ever
 * been paid.
 */
export function useMyTrips(): QueryState<Trip[]> {
  return useQuery(async (token) => {
    const bookings = (await getMyBookings({ token })).filter(holdsSeat);
    const rides = await Promise.all(bookings.map((b) => getRide(b.ride_id, { token })));
    return bookings
      .map((booking, i) => ({ booking, ride: rides[i] }))
      .sort((a, b) => a.ride.departure_at.localeCompare(b.ride.departure_at));
  }, []);
}

export function nextTrip(trips: Trip[]): Trip | null {
  return trips.find((t) => isUpcoming(t.ride.departure_at)) ?? null;
}
