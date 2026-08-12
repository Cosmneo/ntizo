import type {
  AvailabilityDayDTO,
  AvailabilityStartDTO,
  ServiceAvailabilityDTO,
} from "@ntizo/shared/read-models";

export type { ServiceAvailabilityDTO, AvailabilityDayDTO };

/**
 * One bookable moment, exactly as `availability.forService` sends it.
 *
 * Named `Start` rather than re-exported under the DTO's own name because
 * this feature's UI layer (`time-grid.tsx`, `day-strip.ts`'s `groupByHour`)
 * reads it constantly and a short, local name is worth having.
 */
export type Start = AvailabilityStartDTO;

/**
 * Every distinct member id across a fetched window's days, in a stable
 * order.
 *
 * `availability.forService` answers "who is free at this moment" per start
 * (`memberIds`) but never a roster with names — the same choice
 * `providerPublicReadModel` already made deliberately for a workspace's own
 * staff list (see that schema's own doc comment: `members`/`invites` are
 * never on the public tier). A picker built from this can tell two
 * performers apart and let a customer single one out, but it cannot put a
 * name on either — see `member-picker.tsx` for how it labels them instead.
 *
 * Sorted by id, not by first appearance: the order a `Map` or a `Set` yields
 * depends on which day happened to be read first, and a position on the
 * picker drifting between one fetch and the next (because a different day's
 * starts were iterated first) would be a worse bug than an arbitrary order
 * that is at least always the same order.
 */
export function distinctMemberIds(days: readonly AvailabilityDayDTO[]): string[] {
  const ids = new Set<string>();
  for (const day of days) {
    for (const start of day.starts) {
      for (const id of start.memberIds) ids.add(id);
    }
  }
  return [...ids].sort();
}
