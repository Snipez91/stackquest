/**
 * Time-zone handling. All instants are stored as timestamptz (UTC). Calendar
 * concepts — "today", review due dates, the leaderboard week — are computed in
 * an explicit IANA time zone: the learner's for reviews, the team's for weekly
 * leaderboards, so everyone on a team shares the same week boundary.
 */

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Calendar date (YYYY-MM-DD) of `instant` in `tz`. */
export function localDate(tz: string, instant: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addDays(day: string, n: number): string {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000);
}

/** Offset (ms) of `tz` from UTC at `instant`. */
function tzOffsetMs(tz: string, instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const n = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** UTC instant of local midnight starting `day` in `tz` (DST-safe). */
export function startOfLocalDay(tz: string, day: string): Date {
  const guess = new Date(day + "T00:00:00Z");
  let t = guess.getTime() - tzOffsetMs(tz, guess);
  // Re-evaluate once in case the offset differs at the true instant (DST edge).
  t = guess.getTime() - tzOffsetMs(tz, new Date(t));
  return new Date(t);
}

/** Monday (ISO week start) of the week containing `instant`, as a local date in `tz`. */
export function weekStartDay(tz: string, instant: Date = new Date()): string {
  const day = localDate(tz, instant);
  const dow = new Date(day + "T00:00:00Z").getUTCDay(); // 0 = Sunday
  return addDays(day, -((dow + 6) % 7));
}

/** [start, end) UTC instants of the leaderboard week containing `instant` in `tz`. */
export function weekWindow(tz: string, instant: Date = new Date()): { start: Date; end: Date; startDay: string } {
  const startDay = weekStartDay(tz, instant);
  return { start: startOfLocalDay(tz, startDay), end: startOfLocalDay(tz, addDays(startDay, 7)), startDay };
}

export const COMMON_TIME_ZONES = [
  "UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Warsaw",
  "Africa/Lagos",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];
