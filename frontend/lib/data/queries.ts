import {
  co2AvoidedPerPassengerKg,
  co2PerOccupantKg,
  co2SoloKg,
  co2TransitKg,
  costPerPassengerAud,
  costSoloAud,
  costTransitAud,
  petProgress,
  pointsFor,
  TRANSIT_FACTORS,
} from "@/lib/emissions";
import type {
  Accessory,
  BookingConfirmation,
  Campus,
  Comparison,
  FuelType,
  ImpactSummary,
  OwnedAccessory,
  Ride,
  RideDetail,
  RideSummary,
  RewardsSummary,
  TransitLeg,
  Trip,
  User,
  Vehicle,
  VehicleReference,
} from "@/lib/types";

import * as fixtures from "./fixtures";

/**
 * The data layer.
 *
 * One async function per planned backend endpoint, named after it and returning
 * the view model that endpoint will return. Screens import from here and never
 * touch `fixtures.ts`, so switching to the real API is a change inside these
 * function bodies only — every caller already awaits, already handles the
 * shapes, and already renders on the server.
 *
 * The derivations below are the ones the backend's service layer will perform.
 * They live here rather than in components for the same reason they live in
 * `services/` rather than `api/routes/` on the backend: a screen should be
 * handed a number, not a formula.
 */

/* ── Helpers ──────────────────────────────────────────────────────────────── */

const routeKey = (origin: Campus, destination: Campus) => `${origin}:${destination}`;

function driveRoute(origin: Campus, destination: Campus) {
  return (
    fixtures.driveRoutes[routeKey(origin, destination)] ?? {
      distanceKm: 0,
      durationMin: 0,
    }
  );
}

/** Fills each leg's emissions from its distance, so the two cannot disagree. */
function transitRoute(origin: Campus, destination: Campus) {
  const route = fixtures.transitRoutes[routeKey(origin, destination)];
  if (!route) return null;

  const legs: TransitLeg[] = route.legs.map((leg) => ({
    ...leg,
    co2Kg: leg.distanceKm * TRANSIT_FACTORS[leg.mode],
  }));

  return { ...route, legs };
}

/** Seats already taken, i.e. confirmed passengers currently aboard. */
const bookedSeats = (ride: Ride) => ride.totalSeats - ride.availableSeats;

/**
 * Turn a ride into a search-result row.
 *
 * `asViewer` decides whether the numbers include the person reading them. On a
 * ride with a free seat the honest answer to "what would this cost me?" counts
 * the reader as an extra occupant, because that is the trip they would be
 * buying. On a full ride there is no seat to buy, so the row describes the ride
 * as it stands.
 */
function toRideSummary(ride: Ride, asViewer: boolean): RideSummary {
  const vehicle = fixtures.vehicles[ride.vehicleId];
  const driver = fixtures.drivers[ride.driverId];
  const { durationMin } = driveRoute(ride.origin, ride.destination);

  const joining = asViewer && ride.availableSeats > 0;
  const passengers = bookedSeats(ride) + (joining ? 1 : 0);
  const occupants = passengers + 1;

  const soloKg = co2SoloKg(ride.distanceKm, vehicle.fuelConsumption, vehicle.fuelType);
  const perOccupant = co2PerOccupantKg(soloKg, occupants);

  const soloAud = costSoloAud(
    ride.distanceKm,
    vehicle.fuelConsumption,
    vehicle.fuelType,
    fixtures.fuelPrices,
  );

  return {
    ride,
    driver,
    vehicle,
    durationMin,
    co2PerPersonKg: perOccupant,
    costPerPersonAud: costPerPassengerAud(soloAud, passengers),
    co2AvoidedKg: co2AvoidedPerPassengerKg(ride.distanceKm, perOccupant),
    pickupPoint: fixtures.pickupPoints[ride.id] ?? null,
  };
}

/** Simulates network latency so loading states are exercised in development. */
async function settle<T>(value: T): Promise<T> {
  return value;
}

/* ── Users and vehicles ───────────────────────────────────────────────────── */

/** `POST /users/sync` — the signed-in user after Clerk sync. */
export async function getCurrentUser(): Promise<User> {
  return settle(fixtures.currentUser);
}

/** `GET /vehicles/me` */
export async function getMyVehicles(): Promise<Vehicle[]> {
  return settle(
    Object.values(fixtures.vehicles).filter(
      (vehicle) => vehicle.ownerId === fixtures.currentUser.id,
    ),
  );
}

/**
 * `GET /vehicles/reference` — the auto-fill lookup.
 *
 * Returns an empty list for a short query rather than the whole table: the
 * screen treats "no matches" as the cue to offer manual entry, and dumping
 * 17,000 rows at the first keystroke would bury that cue.
 */
export async function searchVehicleReference(
  query: string,
): Promise<VehicleReference[]> {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return settle([]);

  return settle(
    fixtures.vehicleReference
      .filter((row) => `${row.make} ${row.model}`.toLowerCase().includes(needle))
      .slice(0, 6),
  );
}

/* ── Reference data for client-side previews ──────────────────────────────── */

/**
 * The drive leg of every cached campus pair, keyed `"{origin}:{destination}"`.
 *
 * Handed to the post-a-drive form so its live preview can recompute distance as
 * the driver changes the route, without a request per keystroke. Twenty ordered
 * pairs is a few hundred bytes — far less than one round trip.
 */
export async function getDriveRoutes(): Promise<
  Record<string, { distanceKm: number; durationMin: number }>
> {
  return settle(fixtures.driveRoutes);
}

/** The cached fuel prices. Read from the database, never from the Servo API. */
export async function getFuelPrices() {
  return settle(fixtures.fuelPrices);
}

/* ── Rides ────────────────────────────────────────────────────────────────── */

export type RideSort = "departure" | "co2" | "cost";

export interface RideSearchFilters {
  origin: Campus;
  destination: Campus;
  /** ISO date, `YYYY-MM-DD`, in Melbourne time. */
  date?: string;
  minSeats?: number;
  fuelTypes?: FuelType[];
  sort?: RideSort;
}

const SORTERS: Record<RideSort, (a: RideSummary, b: RideSummary) => number> = {
  departure: (a, b) => a.ride.departureAt.localeCompare(b.ride.departureAt),
  co2: (a, b) => a.co2PerPersonKg - b.co2PerPersonKg,
  cost: (a, b) => a.costPerPersonAud - b.costPerPersonAud,
};

/**
 * `GET /rides/search`
 *
 * Full rides are returned rather than filtered out. The wireframe shows them
 * dimmed with a waitlist affordance, and a search that silently drops the 09:05
 * departure looks like a search with no results at 09:00.
 */
export async function searchRides(
  filters: RideSearchFilters,
): Promise<RideSummary[]> {
  const { origin, destination, date, minSeats, fuelTypes, sort = "departure" } = filters;

  const matches = fixtures.rides
    .filter((ride) => ride.origin === origin && ride.destination === destination)
    .filter((ride) => ride.status === "open" || ride.status === "full")
    // Compare on the Melbourne-local date, which is the `YYYY-MM-DD` prefix of
    // an ISO string already written with the +10:00 offset.
    .filter((ride) => !date || ride.departureAt.slice(0, 10) === date)
    // A full ride bypasses the seat filter deliberately. "I need 2 seats" is a
    // question about bookable rides, but a full 09:05 departure is still the
    // most useful thing on the page for someone travelling at 09:00 — it tells
    // them the route is busy rather than empty. Dropping it makes a popular
    // route look like a dead one.
    .filter(
      (ride) =>
        ride.availableSeats === 0 || !minSeats || ride.availableSeats >= minSeats,
    )
    .filter(
      (ride) =>
        !fuelTypes?.length ||
        fuelTypes.includes(fixtures.vehicles[ride.vehicleId].fuelType),
    )
    .map((ride) => toRideSummary(ride, true));

  // Sorting after mapping, because two of the three keys are derived values.
  return settle(matches.sort(SORTERS[sort]));
}

/**
 * Builds the three comparison columns for one ride.
 *
 * `occupants` is passed in rather than recomputed. Deriving it here from the ride
 * would silently disagree with the figure `toRideSummary` already divided by
 * whenever the reader's own membership is in question — the carpool column would
 * then claim a rider count that does not match the per-person number beside it.
 */
function buildComparison(
  ride: Ride,
  carpool: RideSummary,
  user: User,
  occupants: number,
): Comparison {
  const vehicle = fixtures.vehicles[ride.vehicleId];
  const drive = driveRoute(ride.origin, ride.destination);
  const transit = transitRoute(ride.origin, ride.destination);

  const soloKg = co2SoloKg(ride.distanceKm, vehicle.fuelConsumption, vehicle.fuelType);
  const soloAud = costSoloAud(
    ride.distanceKm,
    vehicle.fuelConsumption,
    vehicle.fuelType,
    fixtures.fuelPrices,
  );

  return {
    rideId: ride.id,
    distanceKm: ride.distanceKm,
    fare: user.isConcession ? "concession" : "full",
    transitLegs: transit?.legs ?? [],
    options: [
      {
        mode: "carpool",
        label: "This carpool",
        co2Kg: carpool.co2PerPersonKg,
        costAud: carpool.costPerPersonAud,
        durationMin: carpool.durationMin,
        detail: [
          `${occupants} ${occupants === 1 ? "person" : "people"} aboard`,
          "door to door",
        ],
      },
      {
        mode: "transit",
        label: "Public transport",
        co2Kg: transit ? co2TransitKg(transit.legs) : 0,
        costAud: costTransitAud(user.isConcession),
        durationMin: transit?.durationMin ?? 0,
        detail: [
          user.isConcession ? "concession fare" : "full fare",
          transit ? `${transit.changes} changes` : "no route cached",
        ],
      },
      {
        mode: "solo",
        label: "Driving solo",
        co2Kg: soloKg,
        costAud: soloAud,
        durationMin: drive.durationMin - 3,
        detail: ["fuel only", "plus parking"],
      },
    ],
  };
}

/** `GET /rides/{ride_id}` plus `GET /compare/{ride_id}`. */
export async function getRideDetail(rideId: string): Promise<RideDetail | null> {
  const ride = fixtures.rides.find((candidate) => candidate.id === rideId);
  if (!ride) return settle(null);

  const user = fixtures.currentUser;

  // Whether the reader is already aboard decides how the numbers are framed.
  // Someone holding a booking is inside `bookedSeats` already, so counting them
  // again would split the fuel one extra way and quote them a cheaper trip than
  // their own confirmation screen did.
  const ownBooking = fixtures.bookings.find(
    (booking) =>
      booking.rideId === ride.id &&
      booking.passengerId === user.id &&
      booking.status !== "cancelled",
  );

  const asViewer = !ownBooking;
  const summary = toRideSummary(ride, asViewer);

  const joining = asViewer && ride.availableSeats > 0;
  const occupants = bookedSeats(ride) + (joining ? 1 : 0) + 1;

  return settle({
    ...summary,
    note: fixtures.rideNotes[ride.id] ?? null,
    comparison: buildComparison(ride, summary, user, occupants),
    viewerBookingId: ownBooking?.id ?? null,
  });
}

/* ── Trips and bookings ───────────────────────────────────────────────────── */

/**
 * `GET /bookings/me`, merged with rides the user is driving.
 *
 * The wireframe presents both roles in one list, so the merge happens here
 * rather than in the page. Two endpoints, one view model.
 */
export async function getMyTrips(): Promise<Trip[]> {
  const me = fixtures.currentUser;

  const asPassenger: Trip[] = fixtures.bookings
    .filter((booking) => booking.passengerId === me.id && booking.status !== "cancelled")
    .map((booking) => {
      const ride = fixtures.rides.find((r) => r.id === booking.rideId)!;
      const summary = toRideSummary(ride, false);
      const completed = ride.status === "completed";

      return {
        id: booking.id,
        role: "passenger" as const,
        ride,
        counterparty: fixtures.drivers[ride.driverId].displayName,
        bookingStatus: booking.status,
        // A completed ride's credit is a stored server value; an upcoming one
        // is still an estimate, so it is shown as null rather than guessed at.
        co2AvoidedKg: completed ? summary.co2AvoidedKg : null,
        costAud: completed ? summary.costPerPersonAud : null,
        pointsEarned: completed ? pointsFor(summary.co2AvoidedKg) : null,
      };
    });

  const asDriver: Trip[] = fixtures.rides
    .filter((ride) => ride.driverId === me.id)
    .map((ride) => {
      const vehicle = fixtures.vehicles[ride.vehicleId];
      const passengers = bookedSeats(ride);
      const riders = fixtures.ridersByRide[ride.id] ?? [];
      const soloAud = costSoloAud(
        ride.distanceKm,
        vehicle.fuelConsumption,
        vehicle.fuelType,
        fixtures.fuelPrices,
      );

      return {
        id: ride.id,
        role: "driver" as const,
        ride,
        counterparty:
          riders.length > 0
            ? `${passengers} of ${ride.totalSeats} seats booked · ${riders.join(", ")}`
            : "No riders yet",
        bookingStatus: null,
        co2AvoidedKg: ride.co2Saved,
        costAud: ride.status === "open" ? null : soloAud,
        pointsEarned: ride.pointsEarned,
      };
    });

  return settle(
    [...asPassenger, ...asDriver].sort((a, b) =>
      a.ride.departureAt.localeCompare(b.ride.departureAt),
    ),
  );
}

export interface NextTripView {
  trip: Trip;
  vehicle: Vehicle;
  pickupPoint: string | null;
}

/**
 * The soonest upcoming trip, for the home dashboard's hero card.
 *
 * Returns the vehicle and pick-up point alongside the trip so the card needs a
 * single await. Letting the component fetch its own vehicle would put a second
 * round trip inside a render — the N+1 query, wearing a React costume.
 */
export async function getNextTrip(): Promise<NextTripView | null> {
  const trips = await getMyTrips();
  const trip = trips.find(
    (candidate) =>
      candidate.ride.status === "open" || candidate.ride.status === "full",
  );
  if (!trip) return settle(null);

  return settle({
    trip,
    vehicle: fixtures.vehicles[trip.ride.vehicleId],
    pickupPoint: fixtures.pickupPoints[trip.ride.id] ?? null,
  });
}

/**
 * The state after `POST /bookings` succeeds.
 *
 * This is the only place a driver's phone number is returned. The privacy rule
 * is enforced by the shape of the data, not by a component remembering to hide
 * a field: `DriverPreview` has no `phone`, and only `DriverContact` does.
 */
export async function getBookingConfirmation(
  bookingId: string,
): Promise<BookingConfirmation | null> {
  const booking = fixtures.bookings.find((candidate) => candidate.id === bookingId);
  if (!booking || booking.status === "cancelled") return settle(null);

  const ride = fixtures.rides.find((candidate) => candidate.id === booking.rideId)!;
  const summary = toRideSummary(ride, false);
  const departure = new Date(ride.departureAt);

  return settle({
    booking,
    ride,
    driver: {
      ...fixtures.drivers[ride.driverId],
      phone: fixtures.driverPhones[ride.driverId],
    },
    vehicle: fixtures.vehicles[ride.vehicleId],
    pickupPoint: fixtures.pickupPoints[ride.id] ?? null,
    arriveByAt: new Date(departure.getTime() - 5 * 60 * 1000).toISOString(),
    co2AvoidedKg: summary.co2AvoidedKg,
    costAud: summary.costPerPersonAud,
    pendingPoints: pointsFor(summary.co2AvoidedKg),
  });
}

/* ── Rewards and pet ──────────────────────────────────────────────────────── */

/** `GET /rewards/me` */
export async function getRewards(): Promise<RewardsSummary> {
  const total = fixtures.totalCo2SavedKg;
  const { stage, nextStage, nextStageAtKg } = petProgress(total);

  return settle({
    greenPoints: fixtures.currentUser.greenPoints,
    petName: "Sprout",
    stage,
    totalCo2SavedKg: total,
    nextStage,
    nextStageAtKg,
    ledger: fixtures.pointsLedger,
  });
}

/** `GET /pet/me` and `GET /pet/accessories`, which the shop renders together. */
export async function getPetState(): Promise<{
  catalog: Accessory[];
  owned: OwnedAccessory[];
}> {
  const owned: OwnedAccessory[] = fixtures.accessories
    .filter((accessory) => fixtures.ownedAccessoryIds.includes(accessory.id))
    .map((accessory) => ({
      id: `own-${accessory.id}`,
      accessory,
      equipped: fixtures.equippedAccessoryIds.includes(accessory.id),
      purchasedAt: "2026-08-04T20:11:00+10:00",
    }));

  return settle({ catalog: fixtures.accessories, owned });
}

/* ── Dashboard ────────────────────────────────────────────────────────────── */

/**
 * Aggregates behind the home dashboard's impact card.
 *
 * No endpoint covers this yet — see the gap list. It is served here as one
 * call rather than three so that adding `GET /users/me/impact` later is a
 * one-line change.
 */
export async function getImpact(): Promise<ImpactSummary> {
  return settle({
    co2AvoidedKg: fixtures.totalCo2SavedKg,
    sharedTrips: 18,
    moneySavedAud: 61,
    weeklyCo2Kg: fixtures.weeklyCo2Kg,
  });
}
