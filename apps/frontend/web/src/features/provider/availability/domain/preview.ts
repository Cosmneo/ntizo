import { freeIntervals, type Interval } from "@ntizo/shared/scheduling";
import { addDays, weekdayOf } from "@ntizo/shared/datetime";
import type { AvailabilityException, HouseClosure, WeeklyRule } from "./types";

/**
 * What a member's configured week actually produces, computed in the browser
 * by the same functions the server runs.
 *
 * This module **translates and delegates; it does not decide**. The
 * precedence chain — a house closure empties the day, otherwise a `closed`
 * exception does, otherwise `custom` exceptions replace the weekly pattern,
 * otherwise the weekly pattern stands — lives in `@ntizo/shared/scheduling`'s
 * `freeIntervals` and nowhere else. If a line here starts to look like
 * `if (houseClosed) return []`, that line already exists somewhere better and
 * having it twice is exactly what moving the engine into the shared package
 * was meant to prevent.
 *
 * The two shapes differ only in their field names: the engine speaks
 * `{ start, end }` because it knows nothing about rows, the configuration
 * speaks `startMinute`/`endMinute` because that is what the columns are
 * called. `toDayRules` is the single place that maps one to the other, the
 * same role `list-service-availability.projection.ts` plays on the server.
 *
 * **Configured time, not free time.** `busy` is passed empty on purpose: this
 * answers "when do I work", and "when am I free" is a different question that
 * belongs to an agenda screen. Subtracting bookings here would make the
 * configurator lie about itself the day bookings exist.
 */
export interface PreviewDay {
  /** `YYYY-MM-DD`. */
  readonly date: string;
  /** 0 = Sunday … 6 = Saturday, as stored. */
  readonly weekday: number;
  /** Empty when the member does not work that day. */
  readonly intervals: readonly Interval[];
  /** Why it is empty, when it is — so a blank day can say which problem it is. */
  readonly reason: "house-closure" | "member-closed" | "no-rule" | null;
}

/** Seven civil dates starting on `mondayIso`, which the caller supplies. */
export function weekDates(mondayIso: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(mondayIso, i));
}

function coversDate(closure: Pick<HouseClosure, "fromDate" | "toDate">, date: string): boolean {
  // Civil dates as `YYYY-MM-DD` compare correctly as strings, and both ends
  // are inclusive — the same rule the `house_closure` CHECK enforces.
  return closure.fromDate <= date && date <= closure.toDate;
}

export function previewWeek(input: {
  readonly dates: readonly string[];
  readonly weekly: readonly Pick<WeeklyRule, "weekday" | "startMinute" | "endMinute">[];
  readonly exceptions: readonly Pick<
    AvailabilityException,
    "onDate" | "kind" | "startMinute" | "endMinute"
  >[];
  readonly closures: readonly Pick<HouseClosure, "fromDate" | "toDate">[];
}): PreviewDay[] {
  return input.dates.map((date) => {
    const weekday = weekdayOf(date);
    const houseClosed = input.closures.some((c) => coversDate(c, date));
    const onThisDate = input.exceptions.filter((e) => e.onDate === date);
    const weekly = input.weekly
      .filter((r) => r.weekday === weekday)
      .map((r) => ({ start: r.startMinute, end: r.endMinute }));

    const intervals = freeIntervals({
      houseClosed,
      exceptions: onThisDate.map((e) => ({
        kind: e.kind,
        start: e.startMinute,
        end: e.endMinute,
      })),
      weekly,
      // Configured time, not free time — see this module's doc comment.
      busy: [],
    });

    return { date, weekday, intervals, reason: reasonFor(intervals, houseClosed, onThisDate) };
  });
}

function reasonFor(
  intervals: readonly Interval[],
  houseClosed: boolean,
  onThisDate: readonly { kind: string }[],
): PreviewDay["reason"] {
  if (intervals.length > 0) return null;
  // Ordered as the engine orders its own checks, so the reason shown is the
  // one that actually decided the answer rather than the first that happens
  // to be true.
  if (houseClosed) return "house-closure";
  if (onThisDate.some((e) => e.kind === "closed")) return "member-closed";
  return "no-rule";
}

/**
 * The union across several members — when the business is reachable at all.
 *
 * A day is empty in the team view only when it is empty for everyone, so
 * `reason` survives only where every member agrees on it; where they differ,
 * there is no single reason to give and it is null.
 */
export function mergeWeeks(weeks: readonly (readonly PreviewDay[])[]): PreviewDay[] {
  const first = weeks[0];
  if (!first) return [];
  return first.map((day, i) => {
    const sameDay = weeks.map((w) => w[i]).filter((d): d is PreviewDay => d !== undefined);
    const merged = freeIntervals({
      houseClosed: false,
      exceptions: [],
      // `freeIntervals` merges overlapping stretches on its way through, which
      // is the whole reason this goes through it rather than concatenating.
      weekly: sameDay.flatMap((d) => d.intervals),
      busy: [],
    });
    const reasons = new Set(sameDay.map((d) => d.reason));
    return {
      date: day.date,
      weekday: day.weekday,
      intervals: merged,
      reason: merged.length > 0 ? null : reasons.size === 1 ? (day.reason ?? null) : null,
    };
  });
}
