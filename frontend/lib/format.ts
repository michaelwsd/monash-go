import type { Campus, FuelType, PetStage, TransitMode } from "./types";

/**
 * Display formatting.
 *
 * Every date and time formatter pins `timeZone` to Australia/Melbourne and
 * `locale` to en-AU. Without that, a Server Component renders in the server's
 * zone and the browser rehydrates in the visitor's — React reports a hydration
 * mismatch and, worse, a rider in Perth is shown the wrong departure time. The
 * app is campus-to-campus in Victoria, so one fixed zone is correct, not a
 * simplification.
 */
const LOCALE = "en-AU";
const TIME_ZONE = "Australia/Melbourne";

const timeFormatter = new Intl.DateTimeFormat(LOCALE, {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: TIME_ZONE,
});

const dayFormatter = new Intl.DateTimeFormat(LOCALE, {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: TIME_ZONE,
});

const longDayFormatter = new Intl.DateTimeFormat(LOCALE, {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: TIME_ZONE,
});

const currencyFormatter = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "AUD",
  minimumFractionDigits: 2,
});

const wholeCurrencyFormatter = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
});

const integerFormatter = new Intl.NumberFormat(LOCALE);

/* ── Time ─────────────────────────────────────────────────────────────────── */

/** "08:15" */
export function formatTime(iso: string): string {
  return timeFormatter.format(new Date(iso));
}

/** "Mon 10 Aug" */
export function formatDay(iso: string): string {
  return dayFormatter.format(new Date(iso));
}

/** "Monday 10 August" */
export function formatLongDay(iso: string): string {
  return longDayFormatter.format(new Date(iso));
}

/** "Mon 10 Aug, 08:15" */
export function formatDayTime(iso: string): string {
  return `${formatDay(iso)}, ${formatTime(iso)}`;
}

/** "24 min", or "1 h 12 min" once it passes the hour. */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/**
 * "today" / "tomorrow" / "Mon 10 Aug", relative to `now`.
 *
 * `now` is a required parameter rather than a `new Date()` call inside the
 * function so that callers pass a single timestamp captured once per render.
 * Reading the clock inside a component makes the server and client disagree.
 */
export function formatRelativeDay(iso: string, now: Date): string {
  const dayKey = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(d);

  const target = new Date(iso);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  if (dayKey(target) === dayKey(now)) return "today";
  if (dayKey(target) === dayKey(tomorrow)) return "tomorrow";
  return formatDay(iso);
}

/**
 * "Morning" / "Afternoon" / "Evening", by Melbourne clock.
 *
 * Reads the hour through `Intl` in the fixed zone rather than `date.getHours()`,
 * which would return the *server's* hour — a Render instance in Oregon greeting a
 * Clayton student with "Evening" at 9am.
 */
export function timeOfDayGreeting(now: Date): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hour12: false,
      timeZone: TIME_ZONE,
    }).format(now),
  );

  if (hour < 12) return "Morning";
  if (hour < 18) return "Afternoon";
  return "Evening";
}

/* ── Money and numbers ────────────────────────────────────────────────────── */

/** "$2.10" */
export function formatMoney(aud: number): string {
  return currencyFormatter.format(aud);
}

/** "$61" — for headline totals where cents are noise. */
export function formatMoneyWhole(aud: number): string {
  return wholeCurrencyFormatter.format(aud);
}

/** "1,240" */
export function formatPoints(points: number): string {
  return integerFormatter.format(points);
}

/* ── Emissions ────────────────────────────────────────────────────────────── */

/**
 * "0.32 kg".
 *
 * Two decimals below 10 kg and one above: a single trip's numbers land around
 * 0.3-1.3 kg where the second decimal carries real information, while a
 * lifetime total of "12.43 kg" implies a precision the estimate does not have.
 */
export function formatCo2(kg: number): string {
  return `${kg < 10 ? kg.toFixed(2) : kg.toFixed(1)} kg`;
}

/** "0.32 kg CO₂" */
export function formatCo2Labelled(kg: number): string {
  return `${formatCo2(kg)} CO₂`;
}

/* ── Vehicles ─────────────────────────────────────────────────────────────── */

/**
 * "4.6 L/100km" or "16.8 kWh/100km".
 *
 * The unit is a function of fuel type, never a constant. Printing "L/100km"
 * next to an EV's kWh figure is the display-side version of the costing bug
 * CLAUDE.md warns about — same number, wrong by an order of magnitude.
 */
export function formatConsumption(value: number, fuelType: FuelType): string {
  return fuelType === "electric"
    ? `${value.toFixed(1)} kWh/100km`
    : `${value.toFixed(1)} L/100km`;
}

/** "Toyota Corolla Hybrid" */
export function formatVehicle(vehicle: {
  make: string;
  model: string;
}): string {
  return `${vehicle.make} ${vehicle.model}`;
}

/* ── Enum labels ──────────────────────────────────────────────────────────── */

const CAMPUS_LABELS: Record<Campus, string> = {
  clayton: "Clayton",
  caulfield: "Caulfield",
  peninsula: "Peninsula",
  parkville: "Parkville",
  city: "City",
};

export function formatCampus(campus: Campus): string {
  return CAMPUS_LABELS[campus];
}

/** "Clayton → Caulfield" */
export function formatRoute(origin: Campus, destination: Campus): string {
  return `${formatCampus(origin)} → ${formatCampus(destination)}`;
}

const FUEL_LABELS: Record<FuelType, string> = {
  petrol: "Petrol",
  diesel: "Diesel",
  hybrid: "Hybrid",
  electric: "Electric",
};

export function formatFuelType(fuelType: FuelType): string {
  return FUEL_LABELS[fuelType];
}

const TRANSIT_LABELS: Record<TransitMode, string> = {
  train: "Train",
  bus: "Bus",
  tram: "Tram",
  walk: "Walk",
};

export function formatTransitMode(mode: TransitMode): string {
  return TRANSIT_LABELS[mode];
}

const PET_STAGE_LABELS: Record<PetStage, string> = {
  egg: "Egg",
  hatched: "Hatched",
  juvenile: "Juvenile",
  adult: "Adult",
  legendary: "Legendary",
};

export function formatPetStage(stage: PetStage): string {
  return PET_STAGE_LABELS[stage];
}
