import type { Interval } from "./intervals";

export interface FixedShape {
  readonly durationMinutes: number;
  readonly bufferMinutes: number;
  readonly gridMinutes: number;
}

export interface HourlyShape {
  readonly minMinutes: number;
  readonly stepMinutes: number;
  readonly bufferMinutes: number;
  readonly gridMinutes: number;
}

export interface HourlyOffer {
  readonly start: number;
  /** The longest bookable length at this start, on the step ladder. */
  readonly maxMinutes: number;
}

/** The first grid mark at or after `minute`, with the grid anchored to midnight. */
function firstMark(minute: number, gridMinutes: number): number {
  return Math.ceil(minute / gridMinutes) * gridMinutes;
}

/**
 * Every start where a fixed-length appointment fits.
 *
 * The span that must fit is `duration + buffer` — the buffer is occupied but
 * not sold, so the last appointment of the day appears only if it finishes,
 * cleanup included, before closing.
 */
export function fixedStarts(free: readonly Interval[], shape: FixedShape): number[] {
  const span = shape.durationMinutes + shape.bufferMinutes;
  const out: number[] = [];
  for (const iv of free) {
    for (let t = firstMark(iv.start, shape.gridMinutes); t + span <= iv.end; t += shape.gridMinutes) {
      out.push(t);
    }
  }
  return out;
}

/**
 * Every start where at least the minimum fits, with the longest length each
 * one can carry.
 *
 * The maximum is rounded **down** to the step ladder rather than reported as
 * the raw remaining room: a start advertising 590 minutes when the customer
 * can only choose 180, 210, … 570 would offer a length nobody can book.
 */
export function hourlyStarts(free: readonly Interval[], shape: HourlyShape): HourlyOffer[] {
  const out: HourlyOffer[] = [];
  for (const iv of free) {
    const lastSellable = iv.end - shape.bufferMinutes;
    for (
      let t = firstMark(iv.start, shape.gridMinutes);
      t + shape.minMinutes <= lastSellable;
      t += shape.gridMinutes
    ) {
      const room = lastSellable - t;
      const steps = Math.floor((room - shape.minMinutes) / shape.stepMinutes);
      out.push({ start: t, maxMinutes: shape.minMinutes + steps * shape.stepMinutes });
    }
  }
  return out;
}
