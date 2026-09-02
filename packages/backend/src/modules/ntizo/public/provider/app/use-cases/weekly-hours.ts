import type { WeeklyHoursDTO } from "@ntizo/shared/read-models";

export interface Interval {
  startMinute: number;
  endMinute: number;
}

/** Every weekday, Sunday first — the numbering `member_availability` stores. */
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

/**
 * The union of a set of intervals, sorted and folded.
 *
 * `member_availability` is keyed by member, and this card speaks for the
 * business. Taking `min(start)`–`max(end)` instead would report a business with
 * a morning member and an evening member as open through the afternoon nobody
 * staffs — the one failure this function exists to prevent.
 *
 * Touching intervals merge (`next.start <= current.end`, not `<`), because a
 * member working 08:00–12:00 beside one working 12:00–18:00 is one working day,
 * not two shifts with a seam at noon.
 *
 * Copies before sorting: the caller's array is a query result somebody else may
 * still be reading.
 */
export function mergeIntervals(intervals: readonly Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.startMinute - b.startMinute);
  const merged: Interval[] = [];

  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval.startMinute <= last.endMinute) {
      last.endMinute = Math.max(last.endMinute, interval.endMinute);
      continue;
    }
    merged.push({ startMinute: interval.startMinute, endMinute: interval.endMinute });
  }

  return merged;
}

/**
 * Availability rows — every member's, for one provider — as the seven-day
 * summary the public page renders.
 *
 * All seven weekdays are always returned. A weekday with no rules comes back
 * with an empty `intervals` array, which the UI renders as closed; omitting it
 * would leave the reader to decide whether the day is shut or the data is
 * missing, and those are not the same claim.
 */
export function weeklyHoursFromRows(
  rows: readonly { weekday: number; startMinute: number; endMinute: number }[],
): WeeklyHoursDTO[] {
  return WEEKDAYS.map((weekday) => ({
    weekday,
    intervals: mergeIntervals(
      rows
        .filter((row) => row.weekday === weekday)
        .map((row) => ({ startMinute: row.startMinute, endMinute: row.endMinute })),
    ),
  }));
}
