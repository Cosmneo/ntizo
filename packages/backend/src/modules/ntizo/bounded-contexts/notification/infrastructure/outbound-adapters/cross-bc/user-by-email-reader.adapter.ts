import { eq } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { user } from "../../../../../shared/infrastructure/database/user";
import type { UserByEmailReaderPort } from "../../../app/ports/outbound/user-by-email-reader.port";

/**
 * The single place the Notification context touches `ntizo_user.user` by
 * email instead of id.
 *
 * A plain `eq`, not a lowered comparison: nothing in this codebase normalises
 * an email's case before it is stored. `ntizo_user.user.email` and
 * `better_auth.user.email` are both a bare `text(...).unique()` with no
 * `citext` or lowercasing trigger, `DrizzleUserRepository.findByEmail` does
 * the same exact-match lookup, and `InviteProviderMemberCommand` — the
 * producer of `provider.invite.sent` — writes the invitee's email straight
 * through with no normalisation of its own. Case-folding only this one read
 * would make it inconsistent with every write that put the data there.
 */
export class DrizzleUserByEmailReader implements UserByEmailReaderPort {
  async findUserIdByEmail(email: string): Promise<string | null> {
    const [row] = await getDb()
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);
    return row?.id ?? null;
  }
}
