import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { provider, providerMember } from "../../../../../shared/infrastructure/database/provider/schemas";
import type { ProviderReaderPort } from "../../../app/ports/outbound/provider-reader.port";

/**
 * Where the Communication context asks what it needs to know about a
 * provider — the single place this context touches Provider's tables.
 *
 * A cross-BC adapter rather than an import of Provider's repository or
 * bootstrap, mirroring `DrizzleProviderMemberReader` in the Notification
 * context: this context needs two booleans off two rows, and depending on
 * the other context's bootstrap to get them would couple two lifecycles for
 * single-row lookups.
 */
export class DrizzleProviderReader implements ProviderReaderPort {
  /** `provider.status = 'active'` — the same predicate the public directory uses. */
  async isContactable(providerId: string): Promise<boolean> {
    const [row] = await getDb()
      .select({ id: provider.id })
      .from(provider)
      .where(and(eq(provider.id, providerId), eq(provider.status, "active")))
      .limit(1);
    return row !== undefined;
  }

  /** A `provider_member` row existing for `(providerId, userId)` — no status filter, no other predicate. */
  async isMember(providerId: string, userId: string): Promise<boolean> {
    const [row] = await getDb()
      .select({ id: providerMember.id })
      .from(providerMember)
      .where(and(eq(providerMember.providerId, providerId), eq(providerMember.userId, userId)))
      .limit(1);
    return row !== undefined;
  }
}
