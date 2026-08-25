import { eq } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { emailSuppression } from "../../../../../shared/infrastructure/database/notification/schemas";
import type {
  EmailSuppressionRepositoryPort,
  SuppressionReason,
} from "../../../app/ports/outbound/email-suppression.repository.port";

export class DrizzleEmailSuppressionRepository implements EmailSuppressionRepositoryPort {
  async isSuppressed(email: string): Promise<boolean> {
    const [row] = await getDb()
      .select({ email: emailSuppression.email })
      .from(emailSuppression)
      .where(eq(emailSuppression.email, email))
      .limit(1);
    return row !== undefined;
  }

  /**
   * `ON CONFLICT DO NOTHING`, so the FIRST reason survives.
   *
   * A complaint arriving after a bounce does not rewrite why this address was
   * stopped, and two webhooks racing for the same address both succeed rather
   * than one failing on the primary key. Read-then-insert would let both read
   * "nothing here" and the second collide.
   */
  async suppress(input: {
    email: string;
    reason: SuppressionReason;
    detail?: unknown;
  }): Promise<void> {
    await getDb()
      .insert(emailSuppression)
      .values({
        email: input.email,
        reason: input.reason,
        detail: input.detail ?? null,
      })
      .onConflictDoNothing();
  }
}
