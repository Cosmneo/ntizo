import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { providerMember } from "../../../../../shared/infrastructure/database/provider/schemas";
import type { ProviderMemberReaderPort } from "../../../app/ports/outbound/provider-member-reader.port";

/**
 * Where the Notification context asks whether somebody belongs to a provider.
 *
 * It was "the single place the Notification context touches Provider's tables"
 * when it was the only one. It is not any more — `provider-name-reader.adapter`
 * reads `provider.name` for an invitation's workspace, and
 * `recipient-reader.adapter` joins `provider_member` to find who a workspace
 * notification goes to. All three live in this `cross-bc` directory, which is
 * the actual boundary; no adapter outside it reaches across.
 *
 * A cross-BC adapter rather than an import of Provider's repository: this
 * context needs one boolean, and depending on the other context's bootstrap to
 * get it would couple two lifecycles for a single-row lookup.
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
