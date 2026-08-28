import { desc, eq, exists, inArray, sql } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { attachment, message } from "../../../../../shared/infrastructure/database/communication/schemas";
import type { ThreadPreviewReaderPort } from "../../../app/ports/outbound/thread-preview-reader.port";

export class DrizzleThreadPreviewReader implements ThreadPreviewReaderPort {
  /**
   * `DISTINCT ON (thread_id)`, one query for the whole page — see the port's
   * doc comment. Ordered `created_at desc, id desc` within each group: the
   * newest row wins, `id` breaking a tie the same way
   * `DrizzleMessageRepository.listForThread`'s cursor does — `created_at`
   * defaults to `now()`, which Postgres resolves once per transaction, so two
   * messages in the same thread can share it.
   *
   * `hasAttachment` is a correlated `EXISTS` against `attachment`, computed
   * per row before `DISTINCT ON` collapses each thread's rows down to one —
   * still the one query the port promises, not a second round trip per
   * thread.
   */
  async findLastMessageBodies(
    threadIds: string[],
  ): Promise<Map<string, { body: string; hasAttachment: boolean }>> {
    if (threadIds.length === 0) return new Map();

    const rows = await getDb()
      .selectDistinctOn([message.threadId], {
        threadId: message.threadId,
        body: message.body,
        hasAttachment: exists(
          getDb().select({ one: sql`1` }).from(attachment).where(eq(attachment.messageId, message.id)),
        ),
      })
      .from(message)
      .where(inArray(message.threadId, threadIds))
      .orderBy(message.threadId, desc(message.createdAt), desc(message.id));

    // `exists(...)` types its column `unknown` at the query-builder level —
    // postgres.js itself returns a real boolean for it; `Boolean(...)` here
    // is a type-level cast to what the driver already hands back, not a
    // runtime coercion doing real work.
    return new Map(rows.map((r) => [r.threadId, { body: r.body, hasAttachment: Boolean(r.hasAttachment) }]));
  }
}
