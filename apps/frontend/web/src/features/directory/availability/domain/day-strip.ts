import { addDays, weekdayOf } from "@ntizo/shared/datetime";
import type { Start } from "./types";

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
 * A day's starts, bucketed by the hour they fall in and returned in
 * chronological order — the shape the time grid renders one heading per
 * hour from.
 *
 * Bucketed by computing each start's own hour rather than trusting the
 * input's order to already be grouped: `availability.forService` sorts by
 * `minuteOfDay` ascending, which happens to keep same-hour starts adjacent,
 * but a function that *requires* its caller's sort order to be correct
 * silently breaks the moment something upstream reorders it. Grouping by key
 * and then sorting the keys is correct regardless of input order.
 */
export function groupByHour(starts: readonly Start[]): Start[][] {
  const byHour = new Map<number, Start[]>();
  for (const start of starts) {
    const hour = Math.floor(start.minuteOfDay / 60);
    const group = byHour.get(hour);
    if (group) group.push(start);
    else byHour.set(hour, [start]);
  }
  return [...byHour.entries()].sort(([a], [b]) => a - b).map(([, group]) => group);
}
