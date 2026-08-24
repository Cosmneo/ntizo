const MS_PER_DAY = 86_400_000;

/**
 * The zone's UTC offset, in minutes, at a given instant.
 *
 * `longOffset` gives "GMT+02:00", or the bare string "GMT" for UTC itself —
 * which is why the no-match branch returns 0 rather than throwing.
 */
export function offsetMinutesAt(timeZone: string, utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  }).formatToParts(new Date(utcMs));
  const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const match = /GMT([+-])(\d{1,2}):?(\d{2})?/.exec(name);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3] ?? "0"));
}

/**
 * A local wall-clock time in a zone, as an instant.
 *
 * `minuteOfDay` may be 1440, meaning midnight at the end of `isoDate` — which
 * is how a shop closing at midnight writes its closing hour.
 *
 * The offset cannot simply be read at the naive guess: on a transition day the
 * guess may sit on the wrong side of it. Both the before and after offsets are
 * tried and each candidate is checked against the offset actually in force at
 * it. Two valid candidates means the local time happens twice (autumn) and the
 * earlier wins; none valid means it does not happen at all (spring) and the
 * result moves forward past the gap. This is what `Temporal`'s "compatible"
 * disambiguation does.
 */
export function localDateTimeToInstant(
  timeZone: string,
  isoDate: string,
  minuteOfDay: number,
): Date {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  const naive = Date.UTC(y, m - 1, d, 0, minuteOfDay);

  const before = offsetMinutesAt(timeZone, naive - MS_PER_DAY);
  const after = offsetMinutesAt(timeZone, naive + MS_PER_DAY);
  const candidates = before === after ? [before] : [before, after];

  const valid = candidates
    .map((offset) => ({ offset, ms: naive - offset * 60_000 }))
    .filter((c) => offsetMinutesAt(timeZone, c.ms) === c.offset)
    .map((c) => c.ms);

  if (valid.length > 0) return new Date(Math.min(...valid));
  // The gap a spring-forward left. `before` is the smaller offset, so it
  // yields the later instant — forward past the missing hour.
  return new Date(naive - before * 60_000);
}

/** The civil date in the zone, as `YYYY-MM-DD`. */
export function localDateAt(timeZone: string, instant: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** A civil date shifted by whole days. No zone is involved. */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(y, m - 1, d) + days * MS_PER_DAY);
  return shifted.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday, matching the `weekday` column. */
export function weekdayOf(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** How many civil dates the closed range covers, counting both ends. */
export function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = toIso.split("-").map(Number) as [number, number, number];
  return (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / MS_PER_DAY + 1;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}
