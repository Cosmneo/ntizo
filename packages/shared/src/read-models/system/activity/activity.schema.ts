import { z } from "zod";

/**
 * One entry, as the wire carries it.
 *
 * `payload` is deliberately unconstrained, for the same reason
 * `notificationReadModel`'s is: every activity type carries different facts —
 * a service name and id here, a provider name there — and pinning a union of
 * nine shapes into this package would mean editing it for every new type.
 * The cell that renders a `type` is what knows that type's fields.
 */
export const activityEntryReadModel = z.object({
  id: z.string(),
  /** The key the client translates. Never a sentence — the server has no locale. */
  type: z.string(),
  /**
   * Interpolation values for that key, snapshotted when the row was written.
   *
   * `.catch({})`, not a bare `z.record(...)`: the write side (`Activity.record`)
   * now rejects a non-object payload before it can be written, but that check
   * did not always exist, and the jsonb column itself never enforced it — a
   * row written before the check landed, or inserted by hand, can still hold
   * an array or a scalar here. Without the fallback, one such row fails this
   * field's parse, and because `items` is validated as a whole array, that
   * failure fails every row on the page, not just itself — the same
   * "one bad row must not take down the page" property
   * `DrizzleActivityRepository.listForActor`'s `Activity.rehydrate` already
   * upholds for `type`. A degraded entry renders as an activity with no
   * interpolation values rather than a masked `INTERNAL_ERROR` for the whole
   * feed.
   */
  payload: z.record(z.string(), z.unknown()).catch({}),
  occurredAt: z.string(),
});

export const activityPageReadModel = z.object({
  items: z.array(activityEntryReadModel),
  /**
   * Opaque. Pass it back to get the next page; null means there is no more.
   * Opaque on purpose — a client that parsed it would depend on the ordering
   * columns, and changing them would then be a breaking change.
   */
  nextCursor: z.string().nullable(),
});

export type ActivityEntryDTO = z.infer<typeof activityEntryReadModel>;
export type ActivityPageDTO = z.infer<typeof activityPageReadModel>;
