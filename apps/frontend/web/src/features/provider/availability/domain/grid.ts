import type { PreviewDay } from "./preview";

/**
 * How tall the week grid is, and what the week adds up to.
 *
 * Both answers exist because the old grid drew 06:00–24:00 for everybody:
 * eighteen rows, nearly all permanently empty, which pushed the seven columns
 * past the width of the page and left Friday, Saturday and Sunday behind a
 * sideways scroll. A grid that is only as tall as the hours actually in play
 * fits the whole week without one.
 *
 * Pure functions over `PreviewDay[]` — they read what the engine already
 * produced and decide nothing about availability itself. The precedence chain
 * stays where it belongs, in `@ntizo/shared/scheduling`'s `freeIntervals`.
 */

export interface GridWindow {
  /** Minutes from midnight, on the hour. */
  readonly startMinute: number;
  readonly endMinute: number;
}

const HOUR = 60;
const DAY_END = 24 * HOUR;

/**
 * What an empty week draws.
 *
 * A provider who has set nothing still needs a grid with a height, and the
 * one thing it must not be is the eighteen rows this redesign exists to
 * remove. 08:00–19:00 is eleven rows — wide enough that a first rule typed
 * into an ordinary working day lands inside it rather than immediately
 * resizing the grid under the cursor.
 */
export const FALLBACK_WINDOW: GridWindow = { startMinute: 8 * HOUR, endMinute: 19 * HOUR };

/**
 * One hour of air on each side of the hours actually worked, snapped to whole
 * hours because the row labels are hourly.
 *
 * Clamped to the day at both ends: a rule that starts at 00:30 cannot buy an
 * hour of air above it, and one that runs to 23:30 cannot buy one below.
 */
export function gridWindow(days: readonly PreviewDay[]): GridWindow {
  const intervals = days.flatMap((d) => d.intervals);
  if (intervals.length === 0) return FALLBACK_WINDOW;

  const earliest = Math.min(...intervals.map((iv) => iv.start));
  const latest = Math.max(...intervals.map((iv) => iv.end));

  return {
    startMinute: Math.max(0, Math.floor(earliest / HOUR) * HOUR - HOUR),
    endMinute: Math.min(DAY_END, Math.ceil(latest / HOUR) * HOUR + HOUR),
  };
}

export interface WeekTotals {
  /** Every interval in the week, added up. */
  readonly totalMinutes: number;
  /** Days with any working time at all — a split shift counts once. */
  readonly workingDays: number;
  /** Each day's own total, by `YYYY-MM-DD`. Present and zero for an empty day. */
  readonly byDate: Readonly<Record<string, number>>;
}

/**
 * What the week adds up to — the question a provider brings to this page,
 * which the old screen answered only by making them count rectangles.
 *
 * An empty day gets a zero rather than being left out: the column still needs
 * a number under it, and a missing key renders blank, which reads as "not
 * calculated" rather than "none".
 */
/**
 * The busiest day of the week, or `null` for a week with no hours at all.
 *
 * Ties go to the earlier day, because the days arrive in week order and a
 * strict `>` never displaces an equal — "Monday" and "Thursday" are equally
 * true answers, and the first one keeps the number stable while somebody edits
 * a rule that happens to match it.
 */
export function busiestDay(days: readonly PreviewDay[]): { day: PreviewDay; minutes: number } | null {
  let best: { day: PreviewDay; minutes: number } | null = null;
  for (const day of days) {
    const minutes = day.intervals.reduce((sum, iv) => sum + (iv.end - iv.start), 0);
    if (minutes > 0 && (best === null || minutes > best.minutes)) best = { day, minutes };
  }
  return best;
}

export function weekTotals(days: readonly PreviewDay[]): WeekTotals {
  const byDate: Record<string, number> = {};
  let totalMinutes = 0;
  let workingDays = 0;

  for (const day of days) {
    const minutes = day.intervals.reduce((sum, iv) => sum + (iv.end - iv.start), 0);
    byDate[day.date] = minutes;
    totalMinutes += minutes;
    if (minutes > 0) workingDays += 1;
  }

  return { totalMinutes, workingDays, byDate };
}
