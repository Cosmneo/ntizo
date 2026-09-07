import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { providerMember } from "../../../../../shared/infrastructure/database/provider/schemas";
import type { ProviderMemberReaderPort } from "../../../app/ports/outbound/provider-member.reader.port";

/**
 * Where Quote asks whether somebody belongs to a provider — one row, by
 * `(providerId, userId)`, no role filter, matching Booking's own
 * `DrizzleProviderMemberReader` against the same table: this port answers
 * membership, not seniority, so any member — not only its owner or admin —
 * may propose on or decline a quote.
 *
 * Duplicated across bounded contexts rather than imported — see this
 * context's own `ProviderMemberReaderPort` for why.
 */
export class DrizzleQuoteProviderMemberReader implements ProviderMemberReaderPort {
  async isMember(providerId: string, userId: string): Promise<boolean> {
    const [row] = await getDb()
      .select({ id: providerMember.id })
      .from(providerMember)
      .where(and(eq(providerMember.providerId, providerId), eq(providerMember.userId, userId)))
      .limit(1);
    return row !== undefined;
  }
}
