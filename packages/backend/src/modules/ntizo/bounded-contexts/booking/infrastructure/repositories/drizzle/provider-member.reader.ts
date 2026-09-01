import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { providerMember } from "../../../../../shared/infrastructure/database/provider/schemas";
import type { ProviderMemberReaderPort } from "../../../app/ports/outbound/provider-member-reader.port";

/**
 * Where Booking asks whether somebody belongs to a provider — one row, by
 * `(providerId, userId)`, no role filter: `isMember` answers membership,
 * not seniority, matching this port's own contract.
 *
 * The identical query Notification's `DrizzleProviderMemberReader` runs
 * against the same table, duplicated rather than imported across bounded
 * contexts — see this file's own port for why. A `provider_member` row
 * removed when someone leaves a workspace is what makes this an honest
 * "may act on this booking's provider right now" check rather than a
 * historical one.
 */
export class DrizzleProviderMemberReader implements ProviderMemberReaderPort {
  async isMember(providerId: string, userId: string): Promise<boolean> {
    const [row] = await getDb()
      .select({ id: providerMember.id })
      .from(providerMember)
      .where(and(eq(providerMember.providerId, providerId), eq(providerMember.userId, userId)))
      .limit(1);
    return row !== undefined;
  }
}
