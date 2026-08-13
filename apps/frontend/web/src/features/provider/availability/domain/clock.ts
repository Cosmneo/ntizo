import { isValidTimeZone, localDateAt, offsetMinutesAt } from "@ntizo/shared/datetime";

/** Where "now" falls on the provider's own calendar. */
export interface ZonedNow {
  /** `YYYY-MM-DD` in the provider's zone. */
  readonly date: string;
  /** Minutes past that zone's midnight, 0–1439. */
  readonly minute: number;
}

/**
 * The current moment as the provider's workspace experiences it, not as the
 * reader's laptop does.
 *
 * Every other date on this screen is a civil date in the workspace's timezone —
 * a rule that runs 09:00–18:00 means nine in Maputo whoever is looking — so the
 * "today" column and the line drawn across it have to be resolved in that same
 * zone. Reading `new Date()` in the browser's own offset puts the marker on the
 * wrong day for anybody travelling, and on the wrong hour for everybody outside
 * the workspace's zone, which is precisely the person an organization's admin
 * often is.
 *
 * `null` for a timezone the platform cannot resolve. That is not a hypothetical:
 * `timezone` is free text on the workspace, and a screen that throws because
 * somebody typed `Africa/Maputu` is worse than one that quietly draws no
 * "today" marker.
 */
export function nowInZone(timeZone: string, at: Date = new Date()): ZonedNow | null {
  if (!isValidTimeZone(timeZone)) return null;
  const offset = offsetMinutesAt(timeZone, at.getTime());
  const local = Math.floor(at.getTime() / 60_000) + offset;
  return {
    date: localDateAt(timeZone, at),
    // `%` keeps the sign of its left operand in JS, so a zone behind UTC around
    // midnight would otherwise land on a negative minute of day.
    minute: ((local % 1440) + 1440) % 1440,
  };
}

/** The Monday of the week `date` falls in, as a civil date. */
export function mondayOf(date: string): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const utc = Date.UTC(y, m - 1, d);
  // `getUTCDay` is 0 = Sunday, so Sunday is six days *after* its own Monday.
  const weekday = new Date(utc).getUTCDay();
  return new Date(utc + (weekday === 0 ? -6 : 1 - weekday) * 86_400_000).toISOString().slice(0, 10);
}
