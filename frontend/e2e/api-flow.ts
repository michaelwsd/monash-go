/**
 * End to end, through the frontend's own API client.
 *
 * Starts the real backend against the real database, signs Clerk-shaped
 * tokens with a throwaway key, and walks the exact calls the pages make:
 *
 *   driver     sync -> add a car -> post a drive
 *   passenger  sync -> search finds it -> detail has no phone -> book
 *              -> detail has the phone -> it is in /bookings/me -> cancel
 *              -> phone is gone -> the seat is back
 *   rewards    a second drive, booked, pushed into the past -> driver marks it
 *              complete -> both accounts are credited the same figure ->
 *              completing again changes nothing -> buy and wear an accessory
 *
 * Every assertion is a field a page reads. If this passes, lib/api.ts and
 * the backend agree on every shape the UI depends on.
 *
 *   npm run e2e:api
 *
 * Needs uv and the backend's .env. The backend is started with the Clerk
 * public key overridden from the environment, so no file is touched; the
 * database is the one in .env, and everything written is deleted at the end.
 */

import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { generateKeyPairSync, createSign } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 8765;
const ISSUER = "https://e2e.clerk.accounts.dev";
const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../backend");

process.env.NEXT_PUBLIC_API_URL = `http://127.0.0.1:${PORT}`;

// --- tokens ----------------------------------------------------------------

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

/** The claims the backend requires: sub, email, full_name, iss, exp. */
function signToken(sub: string, email: string, fullName: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({ sub, email, full_name: fullName, iss: ISSUER, iat: now, exp: now + 600 }),
  );
  const signature = createSign("RSA-SHA256").update(`${header}.${payload}`).sign(privateKey);
  return `${header}.${payload}.${b64url(signature)}`;
}

// --- the backend -----------------------------------------------------------

async function startBackend(): Promise<ChildProcess> {
  const proc = spawn(
    "uv",
    ["run", "uvicorn", "app.main:app", "--port", String(PORT), "--log-level", "warning"],
    {
      cwd: BACKEND_DIR,
      env: { ...process.env, CLERK_PEM_PUBLIC_KEY: publicKey, CLERK_ISSUER: ISSUER },
      stdio: ["ignore", "ignore", "inherit"],
    },
  );

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/health`);
      if (res.ok) return proc;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  proc.kill();
  throw new Error("backend did not come up within 30s");
}

/** Removes what the run created. The API has no delete for users, vehicles or
    rides, so this goes through the backend's own database client. */
function cleanup(clerkIds: string[]): void {
  execFileSync(
    "uv",
    [
      "run",
      "python",
      "-c",
      `
from app.db.client import get_supabase
db = get_supabase()
ids = ${JSON.stringify(clerkIds)}
users = db.table("users").select("id").in_("clerk_id", ids).execute().data
# Children before parents: bookings reference rides, rides reference vehicles.
for u in users:
    db.table("bookings").delete().eq("passenger_id", u["id"]).execute()
for u in users:
    for r in db.table("rides").select("id").eq("driver_id", u["id"]).execute().data:
        db.table("bookings").delete().eq("ride_id", r["id"]).execute()
    db.table("rides").delete().eq("driver_id", u["id"]).execute()
    db.table("vehicles").delete().eq("owner_id", u["id"]).execute()
    db.table("pet_accessories").delete().eq("user_id", u["id"]).execute()
    db.table("rewards").delete().eq("user_id", u["id"]).execute()
for c in ids:
    db.table("users").delete().eq("clerk_id", c).execute()
`,
    ],
    { cwd: BACKEND_DIR, stdio: ["ignore", "ignore", "inherit"] },
  );
}

/**
 * Move a ride's departure into the past, straight in the database.
 *
 * POST /rides refuses a departure that has already happened, correctly - a
 * driver cannot offer yesterday's trip. But completion is only allowed *after*
 * departure, so there is no sequence of API calls that reaches a completable
 * ride inside one run. The clock is the thing being faked, so it is faked
 * directly rather than weakening the endpoint's validation for a test.
 */
function rewind(rideId: string, hours = 2): void {
  execFileSync(
    "uv",
    [
      "run",
      "python",
      "-c",
      `
from datetime import UTC, datetime, timedelta
from app.db.client import get_supabase
when = (datetime.now(UTC) - timedelta(hours=${hours})).isoformat()
get_supabase().table("rides").update({"departure_at": when}).eq("id", ${JSON.stringify(rideId)}).execute()
`,
    ],
    { cwd: BACKEND_DIR, stdio: ["ignore", "ignore", "inherit"] },
  );
}

// --- assertions ------------------------------------------------------------

let passed = 0;

function check(label: string, ok: boolean, detail = ""): void {
  if (!ok) throw new Error(`FAIL  ${label}${detail ? `  (${detail})` : ""}`);
  passed += 1;
  console.log(`  ok    ${label}`);
}

function step(name: string): void {
  console.log(`\n${name}`);
}

// --- the flow --------------------------------------------------------------

async function main(): Promise<void> {
  const api = await import("../lib/api.ts");
  const time = await import("../lib/time.ts");

  const stamp = Date.now();
  const driver = {
    token: signToken(`e2e_driver_${stamp}`, "e2e-driver@student.monash.edu", "E2E Driver"),
    clerkId: `e2e_driver_${stamp}`,
  };
  const rider = {
    token: signToken(`e2e_rider_${stamp}`, "e2e-rider@student.monash.edu", "E2E Rider"),
    clerkId: `e2e_rider_${stamp}`,
  };

  step("driver signs in");
  const driverUser = await api.syncUser({ token: driver.token });
  check("sync creates the user", driverUser.email === "e2e-driver@student.monash.edu");
  check("new user has no home campus", driverUser.home_campus === null);

  step("driver finishes their profile");
  const updated = await api.updateProfile(
    { phone: "0412345678", home_campus: "clayton", is_concession: true },
    { token: driver.token },
  );
  check("phone stored without spaces", updated.phone === "0412345678");
  check("home campus set", updated.home_campus === "clayton");

  step("driver adds a car");
  const car = await api.createVehicle(
    { make: "Toyota", model: "Corolla", year: 2020, fuel_type: "petrol", fuel_consumption: 7.1 },
    { token: driver.token },
  );
  check("car is returned with an id", typeof car.id === "string");
  const mine = await api.getMyVehicles({ token: driver.token });
  check("car appears in /vehicles/me", mine.some((v) => v.id === car.id));

  step("driver posts a drive for tomorrow 09:00 Melbourne");
  const tomorrow = time.melbourneDate(new Date(Date.now() + 86_400_000));
  const departure = time.toMelbourneInstant(tomorrow, "09:00");
  const ride = await api.createRide(
    {
      vehicle_id: car.id,
      origin: "clayton",
      destination: "caulfield",
      departure_at: departure,
      total_seats: 1,
    },
    { token: driver.token },
  );
  check("ride opens with every seat free", ride.available_seats === ride.total_seats);
  check("distance came from the route cache", ride.distance_km > 0);
  check("departure round-trips as the same instant", new Date(ride.departure_at).getTime() === new Date(departure).getTime());
  check("departure formats back to 09:00 Melbourne", time.formatTime(ride.departure_at) === "09:00");

  step("driver's own drives");
  const myRides = await api.getMyRides({ token: driver.token });
  check("the posted ride is listed under /rides/mine", myRides.some((r) => r.id === ride.id));

  step("rider signs in and searches");
  await api.syncUser({ token: rider.token });
  const found = await api.searchRides(
    { origin: "clayton", destination: "caulfield", on: tomorrow },
    { token: rider.token },
  );
  check("search on the Melbourne date finds the ride", found.some((r) => r.id === ride.id));
  const reverse = await api.searchRides(
    { origin: "caulfield", destination: "clayton", on: tomorrow },
    { token: rider.token },
  );
  check("the reverse direction does not", !reverse.some((r) => r.id === ride.id));

  step("an empty search still compares the route");
  const estimate = await api.getRouteEstimate(
    { origin: "caulfield", destination: "clayton" },
    { token: rider.token },
  );
  check("three modes, in order", estimate.modes.map((m) => m.mode).join(",") === "carpool,transit,private");
  check("priced with the fleet-average car", estimate.fuel_consumption === 11.1);
  check("one passenger assumed", estimate.riders === 1);
  check("the drive distance came from the route cache", estimate.distance_km > 0);
  check("the transit journey has legs to draw", (estimate.transit_legs?.length ?? 0) > 0);
  check("a carpool seat emits less than driving alone", estimate.modes[0].co2_kg < estimate.modes[2].co2_kg);
  check(
    "the Maps link plans the same pair",
    api.googleMapsDirections("caulfield", "clayton", "transit").includes("travelmode=transit"),
  );

  step("rider opens the ride");
  let detail = await api.getRide(ride.id, { token: rider.token });
  check("driver name is shown", detail.driver.full_name === "E2E Driver");
  check("car is shown", detail.vehicle.make === "Toyota");
  check("phone is absent before booking", !("phone" in detail.driver));
  check("route summary is present", typeof detail.route_summary === "string");

  step("rider books the seat");
  const booking = await api.createBooking(ride.id, { token: rider.token });
  check("booking is confirmed", booking.status === "confirmed");
  detail = await api.getRide(ride.id, { token: rider.token });
  check("phone is present after booking", detail.driver.phone === "0412345678");
  check("seat count dropped", detail.available_seats === 0);

  step("the comparison, now the rider holds a seat");
  const comparison = await api.getComparison(ride.id, { token: rider.token });
  check("three modes, in order", comparison.modes.map((m) => m.mode).join(",") === "carpool,transit,private");
  check(
    "every row has the four fields",
    comparison.modes.every((m) => ["duration_min", "cost", "co2_kg"].every((k) => typeof (m as unknown as Record<string, unknown>)[k] === "number")),
  );
  check("the booked rider is counted once, not as +1", comparison.riders === 1);
  check("a petrol car carries a fuel price", typeof comparison.fuel_price === "number" && comparison.fuel_price > 0);
  check("the transit journey has legs to draw", (comparison.transit_legs?.length ?? 0) > 0);
  const [carpool, , alone] = comparison.modes;
  check("a carpool seat emits less than driving alone", carpool.co2_kg < alone.co2_kg);

  step("the driver sees who is booked");
  const passengers = await api.getRidePassengers(ride.id, { token: driver.token });
  check("the rider is listed with their number", passengers.length === 1 && passengers[0].full_name === "E2E Rider");
  let peekError: unknown = null;
  try {
    await api.getRidePassengers(ride.id, { token: rider.token });
  } catch (caught) {
    peekError = caught;
  }
  check("a passenger asking for the list is a 403", peekError instanceof api.ApiError && peekError.status === 403);

  step("rider's bookings");
  const bookings = await api.getMyBookings({ token: rider.token });
  check("the booking is listed", bookings.some((b) => b.id === booking.id && b.status === "confirmed"));
  const ridersRides = await api.getMyRides({ token: rider.token });
  check("booking a seat does not make it one of the rider's drives", ridersRides.length === 0);

  step("a second rider cannot take the seat");
  const late = signToken(`e2e_late_${stamp}`, "e2e-late@student.monash.edu", "E2E Late");
  await api.syncUser({ token: late });
  let lateError: unknown = null;
  try {
    await api.createBooking(ride.id, { token: late });
  } catch (caught) {
    lateError = caught;
  }
  check("full ride is a 409", lateError instanceof api.ApiError && lateError.status === 409);

  step("driver cannot book their own drive");
  let selfError: unknown = null;
  try {
    await api.createBooking(ride.id, { token: driver.token });
  } catch (caught) {
    selfError = caught;
  }
  check("own ride is a 400", selfError instanceof api.ApiError && selfError.status === 400);

  step("rider cancels");
  const cancelled = await api.cancelBooking(booking.id, { token: rider.token });
  check("booking is cancelled", cancelled.status === "cancelled");
  detail = await api.getRide(ride.id, { token: rider.token });
  check("phone is gone after cancelling", !("phone" in detail.driver));
  check("seat is back", detail.available_seats === 1);
  const again = await api.cancelBooking(booking.id, { token: rider.token });
  check("cancelling twice is still a 200", again.status === "cancelled");

  step("a stranger's booking id is a 404, not a 403");
  let strangerError: unknown = null;
  try {
    await api.cancelBooking(booking.id, { token: late });
  } catch (caught) {
    strangerError = caught;
  }
  check("someone else's booking reads as not found", strangerError instanceof api.ApiError && strangerError.status === 404);

  // ---- completion and rewards (REQ-006, REQ-013) --------------------------

  step("a ride that has not departed cannot be completed");
  let earlyError: unknown = null;
  try {
    await api.completeRide(ride.id, { token: driver.token });
  } catch (caught) {
    earlyError = caught;
  }
  check(
    "completing a future ride is refused",
    earlyError instanceof api.ApiError && earlyError.status === 400,
  );

  step("a second drive, booked, then pushed into the past");
  const past = await api.createRide(
    {
      vehicle_id: car.id,
      origin: "clayton",
      destination: "caulfield",
      departure_at: time.toMelbourneInstant(tomorrow, "17:00"),
      total_seats: 2,
    },
    { token: driver.token },
  );
  const seat = await api.createBooking(past.id, { token: rider.token });
  check("the seat is booked", seat.status === "confirmed");
  rewind(past.id);

  step("only the driver may complete it");
  let riderError: unknown = null;
  try {
    await api.completeRide(past.id, { token: rider.token });
  } catch (caught) {
    riderError = caught;
  }
  check(
    "a passenger completing the ride is a 403",
    riderError instanceof api.ApiError && riderError.status === 403,
  );

  step("the driver marks it complete");
  const beforeDriver = await api.getRewards({ token: driver.token });
  const beforeRider = await api.getRewards({ token: rider.token });
  check("nothing has been earned yet", beforeDriver.total_co2_saved === 0);
  check("a fresh account is an egg", beforeDriver.pet_stage === "egg");
  check("and has a target to aim at", beforeDriver.co2_to_next === 15);

  const awarded = await api.completeRide(past.id, { token: driver.token });
  check("it awarded something", awarded.co2_saved > 0);
  check("points are floor(kg x 100)", awarded.points_earned === Math.floor(awarded.co2_saved * 100));
  check("one passenger was credited", awarded.passengers === 1);
  check("it was not already complete", awarded.already_completed === false);

  step("both accounts are credited the same figure");
  const afterDriver = await api.getRewards({ token: driver.token });
  const afterRider = await api.getRewards({ token: rider.token });
  check(
    "the driver's CO2 rose by the ride's figure",
    Math.abs(afterDriver.total_co2_saved - beforeDriver.total_co2_saved - awarded.co2_saved) < 1e-6,
    `${afterDriver.total_co2_saved} vs ${awarded.co2_saved}`,
  );
  check(
    "the passenger got the same, not a share of it",
    Math.abs(afterRider.total_co2_saved - beforeRider.total_co2_saved - awarded.co2_saved) < 1e-6,
  );
  check("the driver's points rose", afterDriver.green_points === beforeDriver.green_points + awarded.points_earned);
  check("the passenger's points rose by the same", afterRider.green_points === beforeRider.green_points + awarded.points_earned);
  check("the driver's trip is counted", afterDriver.completed_trips === 1);
  check("the passenger's trip is counted", afterRider.completed_trips === 1);

  step("the figures reach the pages that show them");
  const completedRide = await api.getRide(past.id, { token: driver.token });
  check("the ride is completed", completedRide.status === "completed");
  check("and carries its figures", completedRide.points_earned === awarded.points_earned);
  const riderTrips = await api.getMyBookings({ token: rider.token });
  const completedTrip = riderTrips.find((b) => b.ride_id === past.id);
  check("the booking is now completed", completedTrip?.status === "completed");
  const riderView = await api.getRide(past.id, { token: rider.token });
  check("and the ride the passenger reads carries its earnings", riderView.points_earned === awarded.points_earned);
  check("the passenger still sees the phone number", "phone" in riderView.driver);
  const stillAboard = await api.getRidePassengers(past.id, { token: driver.token });
  check("the driver still sees who rode", stillAboard.length === 1);
  const afterwards = await api.getComparison(past.id, { token: rider.token });
  check("the comparison still counts the rider once", afterwards.riders === 1);

  step("completing again changes nothing");
  const repeat = await api.completeRide(past.id, { token: driver.token });
  check("the second call succeeds", repeat.already_completed === true);
  check("and reports the same figures", repeat.points_earned === awarded.points_earned);
  const unchanged = await api.getRewards({ token: driver.token });
  check("the balance did not move", unchanged.green_points === afterDriver.green_points);
  check("nor did the CO2", unchanged.total_co2_saved === afterDriver.total_co2_saved);

  // ---- the shop (REQ-006) -------------------------------------------------

  step("the shop knows what this pet can wear");
  const shop = await api.getShop({ token: driver.token });
  check("the catalogue is seeded", shop.length > 0);
  check("cheapest first", shop.every((item, i) => i === 0 || shop[i - 1].cost <= item.cost));
  check("an egg's own items are unlocked", shop.some((i) => !i.locked));
  check("later stages are locked", shop.some((i) => i.locked));
  check(
    "locked is about the stage, not the price",
    shop.filter((i) => i.locked).every((i) => i.required_stage !== "egg"),
  );
  check("nothing is owned yet", shop.every((i) => !i.owned));

  step("buying an accessory");
  const affordable = shop.find((i) => !i.locked && i.cost <= unchanged.green_points);
  check("something is affordable on one ride's points", affordable !== undefined, `${unchanged.green_points} pts`);
  const bought = await api.buyAccessory(affordable!.id, { token: driver.token });
  check("the points were deducted", bought.green_points === unchanged.green_points - affordable!.cost);
  check("the item is owned", bought.owned.some((o) => o.accessory.id === affordable!.id));
  check("and not yet worn", bought.owned.every((o) => !o.equipped));

  step("wearing it");
  const worn = await api.equipAccessory(affordable!.id, true, { token: driver.token });
  check("it is worn", worn.owned.find((o) => o.accessory.id === affordable!.id)?.equipped === true);
  check("wearing it cost nothing", worn.green_points === bought.green_points);
  const off = await api.equipAccessory(affordable!.id, false, { token: driver.token });
  check("it comes off again", off.owned.find((o) => o.accessory.id === affordable!.id)?.equipped === false);
  check("taking it off is not a refund", off.green_points === bought.green_points);
  check("and it is still owned", off.owned.length === 1);

  step("what the shop refuses");
  const shopNow = await api.getShop({ token: driver.token });
  check("the bought item now reads as owned", shopNow.find((i) => i.id === affordable!.id)?.owned === true);

  let ownedError: unknown = null;
  try {
    await api.buyAccessory(affordable!.id, { token: driver.token });
  } catch (caught) {
    ownedError = caught;
  }
  check("buying the same item twice is refused", ownedError instanceof api.ApiError);

  const lockedItem = shopNow.find((i) => i.locked);
  let lockedError: unknown = null;
  try {
    await api.buyAccessory(lockedItem!.id, { token: driver.token });
  } catch (caught) {
    lockedError = caught;
  }
  check(
    "an item above the pet's stage is a 403",
    lockedError instanceof api.ApiError && lockedError.status === 403,
  );

  const dear = shopNow.find((i) => !i.locked && !i.owned && i.cost > off.green_points);
  let brokeError: unknown = null;
  try {
    await api.buyAccessory(dear!.id, { token: driver.token });
  } catch (caught) {
    brokeError = caught;
  }
  check(
    "not enough points is a 402",
    brokeError instanceof api.ApiError && brokeError.status === 402,
  );
  const stillThere = await api.getPet({ token: driver.token });
  check("a refused purchase left the balance alone", stillThere.green_points === off.green_points);

  return cleanup([driver.clerkId, rider.clerkId, `e2e_late_${stamp}`]);
}

const backend = await startBackend();
try {
  await main();
  console.log(`\n${passed} checks passed`);
} catch (error) {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  backend.kill();
}
