/** A half-open stretch of a day, in minutes from local midnight. */
export interface Interval {
  readonly start: number;
  readonly end: number;
}

/**
 * Sorted, non-overlapping, with touching stretches joined.
 *
 * Empty intervals are dropped rather than kept as zero-width markers: a
 * zero-width free interval offers nothing and would only survive to be
 * special-cased downstream.
 */
export function mergeIntervals(list: readonly Interval[]): Interval[] {
  const sorted = list.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const cur of sorted) {
    const last = out[out.length - 1];
    if (last && cur.start <= last.end) {
      if (cur.end > last.end) out[out.length - 1] = { start: last.start, end: cur.end };
    } else {
      out.push({ start: cur.start, end: cur.end });
    }
  }
  return out;
}

/** `from` with every part of `busy` taken out of it. */
export function subtractIntervals(
  from: readonly Interval[],
  busy: readonly Interval[],
): Interval[] {
  let out = mergeIntervals(from);
  for (const cut of mergeIntervals(busy)) {
    const next: Interval[] = [];
    for (const iv of out) {
      if (cut.end <= iv.start || cut.start >= iv.end) {
        next.push(iv);
        continue;
      }
      if (cut.start > iv.start) next.push({ start: iv.start, end: cut.start });
      if (cut.end < iv.end) next.push({ start: cut.end, end: iv.end });
    }
    out = next;
  }
  return out;
}

export interface DayException {
  readonly kind: "closed" | "custom";
  readonly start: number | null;
  readonly end: number | null;
}

export interface DayRules {
  /** A provider-wide closure covers this date. */
  readonly houseClosed: boolean;
  /** This member's exceptions for this date. */
  readonly exceptions: readonly DayException[];
  /** This member's weekly rules for this weekday. */
  readonly weekly: readonly Interval[];
  /** Already-taken time. Empty until slice 4 supplies bookings. */
  readonly busy: readonly Interval[];
}

/**
 * What is left of one day, in precedence order.
 *
 * A house closure beats a member's exception, which beats their weekly
 * pattern. `custom` exceptions *replace* the pattern rather than adding to
 * it — "on Saturday I work the morning" means the morning, not the morning
 * plus the usual day.
 */
export function freeIntervals(day: DayRules): Interval[] {
  if (day.houseClosed) return [];
  if (day.exceptions.some((e) => e.kind === "closed")) return [];

  const custom: Interval[] = [];
  for (const e of day.exceptions) {
    if (e.kind === "custom" && e.start !== null && e.end !== null) {
      custom.push({ start: e.start, end: e.end });
    }
  }

  const base = custom.length > 0 ? custom : day.weekly;
  return subtractIntervals(base, day.busy);
}
