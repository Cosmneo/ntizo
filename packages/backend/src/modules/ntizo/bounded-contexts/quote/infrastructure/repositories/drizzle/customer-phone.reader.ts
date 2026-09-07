import { eq } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { profile } from "../../../../../shared/infrastructure/database/user/schemas";
import type { CustomerPhoneReaderPort } from "../../../app/ports/outbound/customer-phone.reader.port";

/**
 * The customer's handset, read out of the User context — one column, by
 * `user_id`, the same shape as Booking's own `DrizzleCustomerPhoneReader`.
 *
 * A profile row that does not exist and a profile row whose `phone_number`
 * is null both come back `null`: `AcceptQuoteCommand` treats either the same
 * way (see `QuoteNoCustomerPhoneError`), and distinguishing them here would
 * be a distinction only this file could see.
 */
export class DrizzleQuoteCustomerPhoneReader implements CustomerPhoneReaderPort {
  async findPhoneNumber(userId: string): Promise<string | null> {
    const [row] = await getDb()
      .select({ phoneNumber: profile.phoneNumber })
      .from(profile)
      .where(eq(profile.userId, userId))
      .limit(1);
    return row?.phoneNumber ?? null;
  }
}
