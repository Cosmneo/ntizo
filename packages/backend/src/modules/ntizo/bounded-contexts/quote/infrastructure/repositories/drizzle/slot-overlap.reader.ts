import { and, eq, gt, inArray, lt } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { booking } from "../../../../../shared/infrastructure/database/booking/schemas";
import { SLOT_HOLDING_STATUSES } from "../../../../../shared/infrastructure/database/booking/enums";
import type { SlotOverlapReaderPort } from "../../../app/ports/outbound/slot-overlap.reader.port";

/**
 * The same predicate `lowestFreeSeat` in `booking.repository.ts` asks —
 * same statuses (`SLOT_HOLDING_STATUSES`), same overlap shape
 * (`starts_at < endsAt AND ends_at > startsAt`) — reduced to a boolean:
 * does a slot-holding booking of this member overlap the window. Reading
 * that function's own predicate directly rather than re-deriving one is
 * what keeps the two from ever disagreeing about what "occupied" means.
 *
 * Advisory, not authoritative — see this port's own doc comment for why a
 * `true` here refuses a proposal up front, while the real arbiter stays the
 * exclusion constraint `booking.insert` checks against at the moment a
 * quote is accepted.
 */
export class DrizzleSlotOverlapReader implements SlotOverlapReaderPort {
  async overlaps(input: { providerMemberId: string; startsAt: Date; endsAt: Date }): Promise<boolean> {
    const [row] = await getDb()
      .select({ id: booking.id })
      .from(booking)
      .where(
        and(
          eq(booking.providerMemberId, input.providerMemberId),
          inArray(booking.status, [...SLOT_HOLDING_STATUSES]),
          lt(booking.startsAt, input.endsAt),
          gt(booking.endsAt, input.startsAt),
        ),
      )
      .limit(1);
    return row !== undefined;
  }
}
