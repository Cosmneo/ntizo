import { freeIntervals, type DayException, type Interval } from "./intervals";
import { fixedStarts, hourlyStarts } from "./offers";
import { resolveRuleShape, type ResolvedRuleShape, type RuleShapeInput } from "./rule-shape";

/** One weekly rule on one date, with its own shape. */
export interface DayRule extends RuleShapeInput {
  readonly startMinute: number;
  readonly endMinute: number;
}

/**
 * What the caller is trying to fill each start with — the one thing that is
 * not a rule's to say, since a rule shapes *when*, not *what*.
 *
 * A fixed offer has one knowable length, so there is nothing left to choose.
 * An hourly offer is a minimum plus a step ladder, the same pair
 * `hourlyStarts` already takes — carried here as its own variant, not folded
 * into a bare number, so a caller cannot pass an hourly service's minimum
 * through the fixed path and silently get one-length appointments out of a
 * by-the-hour service.
 */
export type Offer =
  | { readonly kind: "fixed"; readonly durationMinutes: number }
  | { readonly kind: "hourly"; readonly minMinutes: number; readonly stepMinutes: number };

export interface StartsInput {
  readonly houseClosed: boolean;
  readonly exceptions: readonly DayException[];
  readonly rules: readonly DayRule[];
  readonly offer: Offer;
  /** What is already booked. Counted against capacity, never subtracted from the window. */
  readonly busy: readonly Interval[];
}

/** A start's capacity and, for an hourly offer, the longest length it can carry. */
export interface StartCapacity {
  /** A rule's capacity minus how many bookings already overlap this start's occupied span. */
  readonly seatsLeft: number;
  /**
   * Null for a fixed offer — one knowable length, nothing left to report —
   * and the offer's own maximum otherwise. The same split `offersFor` in
   * `list-service-availability.projection.ts` already draws, for the same
   * reason: a fixed length is not a choice, so there is nothing to cap.
   */
  readonly maxMinutes: number | null;
  /**
   * The winning rule's own capacity (null already resolved to one), carried
   * alongside `seatsLeft` rather than left for a caller to re-derive by
   * subtracting occupancy back out. A booking-side caller needs the total,
   * not what's left of it, to assign a seat number — and re-resolving
   * "which rule won this start" outside this loop is the second reading of
   * the same question this engine exists to prevent.
   */
  readonly capacity: number;
}

/** Every start one rule offers on its shaped free time, with its own length ceiling. */
function offersFrom(
  offer: Offer,
  free: readonly Interval[],
  shape: ResolvedRuleShape,
): Array<{ readonly start: number; readonly maxMinutes: number | null }> {
  if (offer.kind === "fixed") {
    const starts = fixedStarts(free, {
      durationMinutes: offer.durationMinutes,
      bufferMinutes: shape.bufferMinutes,
      gridMinutes: shape.gridMinutes,
    });
    return starts.map((start) => ({ start, maxMinutes: null }));
  }
  return hourlyStarts(free, {
    minMinutes: offer.minMinutes,
    stepMinutes: offer.stepMinutes,
    bufferMinutes: shape.bufferMinutes,
    gridMinutes: shape.gridMinutes,
  });
}

/**
 * The span a booking at this start occupies — buffer included, since that
 * time is held even though it is not sold. A fixed offer's span is its one
 * knowable length; an hourly offer has no single length, so its span is the
 * smallest block `hourlyStarts` would ever sell, matching that function's own
 * notion of the minimum room a start needs.
 */
function occupiedSpan(offer: Offer, bufferMinutes: number): number {
  const length = offer.kind === "fixed" ? offer.durationMinutes : offer.minMinutes;
  return length + bufferMinutes;
}

/**
 * An hourly start's length ceiling, capped at the point where overlapping
 * bookings would first reach the rule's capacity.
 *
 * `hourlyStarts` only knows the free interval — and per the module comment
 * above, that free interval is computed with `busy: []`, so its ceiling is
 * blind to real bookings sitting inside the window. `overlapCount` in the
 * main loop below only protects the *minimum* span (`occupiedSpan`), which
 * is enough to decide whether a start is offered at all, but says nothing
 * about how long a booking placed there may run. Without this, a start next
 * to an existing booking would still advertise a length long enough to run
 * straight through it — nothing downstream checks for that collision.
 *
 * At capacity 1 the cap is simply the earliest busy interval at or after
 * `start` — the same point the old subtract-from-the-window engine stopped
 * at. Above capacity 1, a booking already overlapping the minimum span still
 * uses up one seat, so this sorts every relevant booking's own start (pinned
 * up to `start` if it began earlier, since it is already in view from there)
 * and takes the `capacity`-th one directly — the minute at which as many
 * bookings are in view as there is room for, with no separate case needed
 * for "already overlapping" versus "starts later".
 *
 * Returns null when fewer than `capacity` bookings ever overlap from
 * `start` onward — nothing to cap beyond what the free interval already
 * bounds.
 */
function bookingCeiling(
  busy: readonly Interval[],
  start: number,
  capacity: number,
  offer: { readonly minMinutes: number; readonly stepMinutes: number },
  bufferMinutes: number,
): number | null {
  const boundaries = busy
    .filter((b) => b.end > start)
    .map((b) => Math.max(b.start, start))
    .sort((a, b) => a - b);
  const bound = boundaries[capacity - 1];
  if (bound === undefined) return null;

  // Rounded down to the step ladder for the same reason `hourlyStarts`
  // rounds its own ceiling down: advertising a length nobody can pick is
  // the bug that function's own comment describes.
  const room = bound - bufferMinutes - start;
  const steps = Math.floor((room - offer.minMinutes) / offer.stepMinutes);
  return offer.minMinutes + steps * offer.stepMinutes;
}

/**
 * How many bookings overlap `[from, to)`.
 *
 * Half-open on purpose: a booking that starts exactly where the span ends
 * (`b.start === to`) has not touched a single minute of it, so `<` rather
 * than `<=` here — the same boundary rule `to` itself already relies on.
 */
function overlapCount(busy: readonly Interval[], from: number, to: number): number {
  let n = 0;
  for (const b of busy) if (b.start < to && from < b.end) n += 1;
  return n;
}

/**
 * Every start one member offers on one date, and how many bookings each holds.
 *
 * Generated **per rule**, which is the whole point. `freeIntervals` merges
 * overlapping and back-to-back stretches — 08:00–12:00 beside 11:00–14:00
 * becomes one 08:00–14:00 — and that merge is correct for "when is this person
 * free" and destroys the only thing that could say which rule contributed
 * which minutes. Once merged, a 15-minute grid in the morning and a 60-minute
 * one in the afternoon cannot both be honoured: the merged interval has no
 * memory of where one rule's window ended and the other's began, so whichever
 * rule's shape is read for the merged stretch silently overwrites the other's.
 * A future "optimisation" that hoists `freeIntervals` out of this loop back to
 * a single call reintroduces exactly that bug — the loop below exists so it
 * cannot happen.
 *
 * So `freeIntervals` is asked once per rule, with that rule as the only weekly
 * entry. It keeps its job — the house-closure/closed/custom precedence chain
 * is still its and only its — and it is simply asked a narrower question.
 *
 * `busy` is deliberately **not** passed to `freeIntervals`: with capacity
 * above 1 a booked start is still offered to the next customer, which the
 * old subtract-from-the-window approach could never express — a subtraction
 * has no notion of "still has room". So instead, once a start's span is
 * known, `busy` is *counted* against that rule's capacity rather than
 * removed from the free time. At capacity 1 the count and the old
 * subtraction land on the same starts, which is what makes this change
 * invisible to every provider who never opens the field.
 */
export function startsForDay(input: StartsInput): Map<number, StartCapacity> {
  const out = new Map<number, StartCapacity>();

  for (const rule of input.rules) {
    const shape = resolveRuleShape(rule);
    // "Open, nothing to pick" — the window still exists, it just offers no
    // list of times.
    if (!shape.offersSlots) continue;

    const free = freeIntervals({
      houseClosed: input.houseClosed,
      exceptions: input.exceptions,
      weekly: [{ start: rule.startMinute, end: rule.endMinute }],
      busy: [],
    });

    const span = occupiedSpan(input.offer, shape.bufferMinutes);

    for (const { start, maxMinutes } of offersFrom(input.offer, free, shape)) {
      const taken = overlapCount(input.busy, start, start + span);
      const seatsLeft = shape.capacity - taken;
      // A start with no seats left is not offered at all — the same result
      // subtracting `busy` from the window used to give, arrived at by
      // counting instead.
      if (seatsLeft <= 0) continue;

      // The free interval's ceiling has no notion of a booking sitting
      // inside it — see `bookingCeiling`'s own comment — so an hourly
      // offer's maximum is capped again here, against the bookings
      // `freeIntervals` above was never shown.
      const cap =
        input.offer.kind === "hourly"
          ? bookingCeiling(input.busy, start, shape.capacity, input.offer, shape.bufferMinutes)
          : null;
      const cappedMax = cap === null || maxMinutes === null ? maxMinutes : Math.min(maxMinutes, cap);

      // A start offered by two rules is offered by both, so it takes
      // whichever rule leaves more room — and with it, that rule's own
      // length ceiling and own capacity, so none of the three mix.
      const existing = out.get(start);
      if (existing === undefined || seatsLeft > existing.seatsLeft) {
        out.set(start, { seatsLeft, maxMinutes: cappedMax, capacity: shape.capacity });
      }
    }
  }

  return out;
}
