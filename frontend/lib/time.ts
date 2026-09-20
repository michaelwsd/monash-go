/**
 * Every date in the app is a Melbourne date, and this is the only file that
 * knows it.
 *
 * The backend stores departures as UTC and reads search dates as Melbourne
 * calendar days. A user's browser could be set to anything, so nothing here
 * trusts the local zone: conversions go through Intl with the zone named.
 */

export const MELBOURNE = "Australia/Melbourne";

type Parts = Record<string, string>;

function partsIn(zone: string, at: Date): Parts {
  const out: Parts = {};
  for (const { type, value } of new Intl.DateTimeFormat("en-AU", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at)) {
    out[type] = value;
  }
  return out;
}

/** Minutes Melbourne is ahead of UTC at a given instant: 600 in AEST, 660 in AEDT. */
function offsetMinutesAt(instant: Date): number {
  const p = partsIn(MELBOURNE, instant);
  const asIfUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return (asIfUtc - instant.getTime()) / 60_000;
}

/**
 * A Melbourne wall-clock time to the instant it names, as UTC ISO.
 *
 * `2026-09-15` + `09:00` -> `2026-09-14T23:00:00.000Z` in September (AEST),
 * `2026-11-15` + `09:00` -> `2026-11-14T22:00:00.000Z` in November (AEDT).
 *
 * Two passes: the offset depends on the instant, and the instant depends on
 * the offset. The first guess is off by an hour on the day the clocks change;
 * the second pass corrects it.
 */
export function toMelbourneInstant(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const naive = Date.UTC(y, m - 1, d, hh, mm);
  const guess = new Date(naive - offsetMinutesAt(new Date(naive)) * 60_000);
  const exact = new Date(naive - offsetMinutesAt(guess) * 60_000);
  return exact.toISOString();
}

/** The Melbourne calendar day an instant falls on, as `YYYY-MM-DD`. */
export function melbourneDate(iso: string | Date): string {
  const p = partsIn(MELBOURNE, new Date(iso));
  return `${p.year}-${p.month}-${p.day}`;
}

export function todayMelbourne(): string {
  return melbourneDate(new Date());
}

function fmt(iso: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-AU", { timeZone: MELBOURNE, ...options }).format(
    new Date(iso),
  );
}

/** `08:15` */
export function formatTime(iso: string): string {
  return fmt(iso, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

/** `Mon 10 Aug` */
export function formatDay(iso: string): string {
  // Assembled from parts: en-AU would give "Mon, 10 Sept" and en-US "Mon, Sep
  // 10". The wireframes use weekday, day, three-letter month, no comma.
  const p: Record<string, string> = {};
  for (const { type, value } of new Intl.DateTimeFormat("en-US", {
    timeZone: MELBOURNE,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).formatToParts(new Date(iso))) {
    p[type] = value;
  }
  return `${p.weekday} ${p.day} ${p.month}`;
}

/** `Mon 10 Aug, 08:15` */
export function formatDateTime(iso: string): string {
  return `${formatDay(iso)}, ${formatTime(iso)}`;
}

/** `Monday 10 August 2026` */
export function formatLongDate(iso: string): string {
  return fmt(iso, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/** "today", "tomorrow", or the day - for the dashboard's next-trip line. */
export function relativeDay(iso: string): string {
  const day = melbourneDate(iso);
  const today = todayMelbourne();
  if (day === today) return "today";
  const tomorrow = melbourneDate(new Date(Date.now() + 86_400_000));
  if (day === tomorrow) return "tomorrow";
  return formatDay(iso);
}

export function isUpcoming(iso: string): boolean {
  return new Date(iso).getTime() > Date.now();
}

/** `27 min`, `1 h 41 min`. */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
