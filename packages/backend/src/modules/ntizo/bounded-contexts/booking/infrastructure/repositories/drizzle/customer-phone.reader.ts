import { eq } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { profile } from "../../../../../shared/infrastructure/database/user/schemas";
import type { CustomerPhoneReaderPort } from "../../../app/ports/outbound/customer-phone.reader.port";

/**
 * Where Booking asks for the handset an M-Pesa prompt should go to — one
 * column, by `user_id`, the same shape as this context's other cross-context
 * readers (`DrizzleProviderMemberReader`, `DrizzleProviderSnapshotReader`).
 *
 * Two different absences collapse into one `null` on purpose: a profile row
 * that does not exist, and a profile row whose `phone_number` is null. Both
 * mean "we have no number to charge", the caller does the same thing with
 * either, and distinguishing them would be a distinction only this file could
 * see. `profile` is created empty at registration, so in practice it is
 * almost always the second.
 */
export class DrizzleCustomerPhoneReader implements CustomerPhoneReaderPort {
  async findPhoneNumber(userId: string): Promise<string | null> {
    const [row] = await getDb()
      .select({ phoneNumber: profile.phoneNumber })
      .from(profile)
      .where(eq(profile.userId, userId))
      .limit(1);
    return row?.phoneNumber ?? null;
  }
}
