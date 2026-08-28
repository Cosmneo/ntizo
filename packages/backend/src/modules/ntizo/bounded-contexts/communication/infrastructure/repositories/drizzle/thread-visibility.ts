import { and, eq, exists, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { thread } from "../../../../../shared/infrastructure/database/communication/schemas";
import { providerMember } from "../../../../../shared/infrastructure/database/provider/schemas";

/**
 * Who may see a thread's contents: the customer on it, or a real member of
 * its provider. Nobody else.
 *
 * Written once because it is a security rule with two callers —
 * `DrizzleThreadRepository.findVisible` and
 * `DrizzleAttachmentRepository.findVisible` — and two hand-written copies
 * of a security rule stay in sync only until the first person edits one of
 * them. A soft-delete check, a blocked-user check, an archived-thread
 * check: each is one edit that would otherwise have to be remembered twice.
 *
 * It is deliberately NOT `message.repository.ts`'s `fromTheOtherSide`.
 * That answers "is this row from the side the viewer is not on" — a
 * different question, whose second branch is satisfied by any viewer who
 * is not the customer, a stranger included. It is correct for counting
 * unread and wrong for deciding access.
 *
 * Any query using this must have `thread` in scope — joined, if it does not
 * select from it directly.
 */
export function visibleToViewer(viewerUserId: string): SQL | undefined {
  return or(
    eq(thread.customerUserId, viewerUserId),
    exists(
      getDb()
        .select({ one: sql`1` })
        .from(providerMember)
        .where(
          and(
            eq(providerMember.providerId, thread.providerId),
            eq(providerMember.userId, viewerUserId),
          ),
        ),
    ),
  );
}
