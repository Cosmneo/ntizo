import { eq, inArray } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { profile, user } from "../../../../../shared/infrastructure/database/user/schemas";
import { providerMember } from "../../../../../shared/infrastructure/database/provider/schemas";
import type { Recipient, RecipientReaderPort } from "../../../app/ports/outbound/recipient-reader.port";

/**
 * The language a recipient gets when they have no profile row.
 *
 * The column itself is `notNull().default("en-US")`, so this only applies when
 * the whole row is missing — which sign-up makes impossible today. Chosen
 * anyway rather than dropping the recipient: an email in the wrong language is
 * recoverable and an email nobody sent is not.
 */
const FALLBACK_LOCALE = "en-US";

export class DrizzleRecipientReader implements RecipientReaderPort {
  async forUser(userId: string): Promise<Recipient | null> {
    const [row] = await getDb()
      .select({ id: user.id, email: user.email, language: profile.language })
      .from(user)
      // LEFT, not inner: a user with no profile must still be reachable. An
      // inner join here would silently drop them, and a dropped email looks
      // exactly like an email that was never triggered.
      .leftJoin(profile, eq(profile.userId, user.id))
      .where(eq(user.id, userId))
      .limit(1);

    if (!row) return null;
    return { userId: row.id, email: row.email, locale: row.language ?? FALLBACK_LOCALE };
  }

  /**
   * Every member of a workspace, each in their own language.
   *
   * One notification, several deliveries. This is the reason `locale` lives on
   * the delivery rather than on the notification: a Portuguese owner and a
   * French colleague read the same event in different words.
   */
  async forProviderMembers(providerId: string): Promise<Recipient[]> {
    const members = await getDb()
      .select({ userId: providerMember.userId })
      .from(providerMember)
      .where(eq(providerMember.providerId, providerId));

    if (members.length === 0) return [];
    const ids = members.map((m) => m.userId);

    const rows = await getDb()
      .select({ id: user.id, email: user.email, language: profile.language })
      .from(user)
      .leftJoin(profile, eq(profile.userId, user.id))
      .where(inArray(user.id, ids));

    return rows.map((r) => ({
      userId: r.id,
      email: r.email,
      locale: r.language ?? FALLBACK_LOCALE,
    }));
  }
}
