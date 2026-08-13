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
}

/** A start's capacity and, for an hourly offer, the longest length it can carry. */
export interface StartCapacity {
  /**
   * Capacity, not occupancy: this slice of the feature has no bookings to
   * weigh against it yet, so a rule's raw capacity is returned here as-is.
   * Turning it into seats actually left is Task 4's job, once there is
   * something to subtract.
   */
  readonly seatsLeft: number;
  /**
   * Null for a fixed offer — one knowable length, nothing left to report —
   * and the offer's own maximum otherwise. The same split `offersFor` in
   * `list-service-availability.projection.ts` already draws, for the same
   * reason: a fixed length is not a choice, so there is nothing to cap.
   */
  readonly maxMinutes: number | null;
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
 * `busy` is deliberately **not** passed: with capacity above 1 a booked start
 * is still offered, so occupancy is counted by the caller against the capacity
 * returned here rather than subtracted from the free time.
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

    for (const { start, maxMinutes } of offersFrom(input.offer, free, shape)) {
      // A start offered by two rules is offered by both, so it takes the
      // larger capacity rather than whichever rule was read last — and with
      // it, that rule's own length ceiling, so the two never mix.
      const existing = out.get(start);
      if (existing === undefined || shape.capacity > existing.seatsLeft) {
        out.set(start, { seatsLeft: shape.capacity, maxMinutes });
      }
    }
  }

  return out;
}
