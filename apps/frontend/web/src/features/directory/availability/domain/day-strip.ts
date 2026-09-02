import { addDays, weekdayOf } from "@ntizo/shared/datetime";
import type { AvailabilityDayDTO, Start } from "./types";

/**
 * The seven civil dates of the Monday-first week `anchorIso` falls in.
 *
 * `weekdayOf` speaks `Date#getUTCDay`'s numbering — 0 Sunday … 6 Saturday —
 * the same convention `provider/availability/domain/week.ts`'s
 * `WEEKDAY_ORDER` already documents for the provider's own screen. A Sunday
 * anchor is the one day that numbering puts *before* Monday in storage terms
 * even though it is the last day of its own display week, which is why the
 * offset back to Monday is six days for it and not treated as "day -1 of the
 * next week".
 */
export function weekOf(anchorIso: string): string[] {
  const weekday = weekdayOf(anchorIso);
  const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;
  const monday = addDays(anchorIso, -daysSinceMonday);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/**
 * Whether `dateIso` is strictly before `todayIso` — the rule the date strip
 * uses to strike a day through and refuse it as a selection.
 *
 * Takes `todayIso` as an argument rather than reading `Date.now()` itself:
 * "today" is the civil date in the *service's* timezone, not the visitor's
 * device clock, and only the caller — which has `availability.forService`'s
 * own `timezone` field in hand — can resolve that. A pure string comparison
 * is enough because both sides are already `YYYY-MM-DD`, which sorts
 * lexicographically exactly the way it sorts chronologically.
 */
export function isPast(dateIso: string, todayIso: string): boolean {
  return dateIso < todayIso;
}

/**
 * How many bookable start times each date carries, keyed by that date.
 *
 * The number is `starts.length` and deliberately **not** a sum of
 * `seatsLeft`. A start is one appointment a customer can ask for, which is
 * exactly what "11 livres" claims; how many seats sit behind each one is a
 * fact about the provider's capacity that a customer's calendar has no
 * business restating. A date the response never mentioned is simply absent
 * here, and the caller reads that as zero — which is what a closed day is.
 */
export function startsByDate(days: readonly AvailabilityDayDTO[]): Map<string, number> {
  return new Map(days.map((day) => [day.date, day.starts.length]));
}

/**
 * What a full day looks like **for this provider**: the busiest day in the
 * window currently on screen.
 *
 * Zero when nothing in the window is open at all, which `dayLoad` answers
 * rather than divides by.
 */
export function fullDayStarts(counts: readonly number[]): number {
  return counts.reduce((most, count) => (count > most ? count : most), 0);
}

/** How much of a normal day a date still has free — what colours the capacity bar. */
export type DayLoad = "closed" | "scarce" | "limited" | "open";

/**
 * **A fraction of that provider's own fullest day, never an absolute count.**
 *
 * A barber who publishes four starts a day and still has all four is not
 * "nearly full"; a salon with thirty a day down to its last four is not
 * "comfortable". Any fixed threshold gets one of those two backwards, and the
 * first of them is the common case in this market. So the scale is the
 * busiest day in the week being looked at — the only "normal day for this
 * provider" this screen can observe without a second query.
 *
 * Two thresholds, at two thirds and one third. Two thirds because a day still
 * offering most of itself is unremarkable and should not be coloured as
 * though it were news. One third because "about a third left" is where a
 * customer who wants a choice of times is better told to decide now than
 * surprised tomorrow. Thirds rather than something like 80/20 because a
 * provider offering three starts a day must still be able to reach every
 * band; at 80/20 that provider would jump straight from "open" to "scarce"
 * and the middle band would be unreachable for them.
 *
 * **Both comparisons are strict**, which is what makes those three bands
 * genuinely reachable on a three-start day: at two thirds exactly the day is
 * already down to two of three, which is the middle band and not the top one,
 * and at one third exactly it is on its last one. Written as `share > 2/3`
 * rather than `starts * 3 > fullDay * 2` only because the fractions are the
 * thing being described; both sides of each comparison are computed the same
 * way, so the boundary cases land deterministically rather than on whichever
 * side floating point rounds to.
 *
 * Today is legitimately scarcer than the rest of the week here, because the
 * projection has already dropped the starts that have passed. That is the
 * true reading rather than a distortion: what is left of today really is what
 * is left.
 */
export function dayLoad(starts: number, fullDay: number): DayLoad {
  if (starts <= 0) return "closed";
  if (fullDay <= 0) return "open";
  const share = starts / fullDay;
  if (share > 2 / 3) return "open";
  if (share > 1 / 3) return "limited";
  return "scarce";
}

/** Noon in the service's own clock — where the morning section stops and the afternoon begins. */
const MIDDAY_MINUTE = 12 * 60;

/**
 * A day's starts split into morning and afternoon — the two sections the time
 * grid draws.
 *
 * Split on `minuteOfDay`, which the projection computes in the **service's**
 * timezone (`localDateTimeToInstant(info.timezone, date, minuteOfDay)`), so a
 * 09:00 start is in the morning for the provider and for the customer
 * standing in front of them rather than in whichever zone the reader's device
 * happens to be set to.
 *
 * Either half can come back empty, and both are returned regardless: the
 * caller draws a heading only over the half that has starts under it, because
 * a provider who works afternoons only must not read "Manhã" above nothing.
 */
export function splitByHalfDay(starts: readonly Start[]): { morning: Start[]; afternoon: Start[] } {
  const morning: Start[] = [];
  const afternoon: Start[] = [];
  for (const start of starts) {
    if (start.minuteOfDay < MIDDAY_MINUTE) morning.push(start);
    else afternoon.push(start);
  }
  return { morning, afternoon };
}

/**
 * When an appointment beginning at `startsAt` finishes, as an ISO instant.
 *
 * Instants in, instants out. The two ends of a booking are printed together
 * in one timezone by whoever renders them, and doing this arithmetic on a
 * civil time instead would be doing it in whichever zone this code happens to
 * be running in — the substitution that has already cost this flow a wrong
 * grid once.
 */
export function endOfStart(startsAt: string, durationMinutes: number): string {
  return new Date(new Date(startsAt).getTime() + durationMinutes * 60_000).toISOString();
}
