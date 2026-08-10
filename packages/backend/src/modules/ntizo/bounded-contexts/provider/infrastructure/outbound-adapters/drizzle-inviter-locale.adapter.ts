import { eq } from "drizzle-orm";
import { getDb } from "../../../../../better-auth/infrastructure/client/drizzle";
import { profile } from "../../../../shared/infrastructure/database/user/schemas";
import type { InviterLocalePort } from "../../app/ports/outbound";

/** Reads `profile.language`. One column, one row, no join. */
export class DrizzleInviterLocaleAdapter implements InviterLocalePort {
  async localeFor(userId: string): Promise<string | null> {
    const [row] = await getDb()
      .select({ language: profile.language })
      .from(profile)
      .where(eq(profile.userId, userId))
      .limit(1);
    return row?.language ?? null;
  }
}
