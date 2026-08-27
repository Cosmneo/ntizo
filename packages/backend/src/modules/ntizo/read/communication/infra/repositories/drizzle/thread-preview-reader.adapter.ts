import { desc, inArray } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { message } from "../../../../../shared/infrastructure/database/communication/schemas";
import type { ThreadPreviewReaderPort } from "../../../app/ports/outbound/thread-preview-reader.port";

export class DrizzleThreadPreviewReader implements ThreadPreviewReaderPort {
  /**
   * `DISTINCT ON (thread_id)`, one query for the whole page — see the port's
   * doc comment. Ordered `created_at desc, id desc` within each group: the
   * newest row wins, `id` breaking a tie the same way
   * `DrizzleMessageRepository.listForThread`'s cursor does — `created_at`
   * defaults to `now()`, which Postgres resolves once per transaction, so two
   * messages in the same thread can share it.
   */
  async findLastMessageBodies(threadIds: string[]): Promise<Map<string, string>> {
    if (threadIds.length === 0) return new Map();

    const rows = await getDb()
      .selectDistinctOn([message.threadId], { threadId: message.threadId, body: message.body })
      .from(message)
      .where(inArray(message.threadId, threadIds))
      .orderBy(message.threadId, desc(message.createdAt), desc(message.id));

    return new Map(rows.map((r) => [r.threadId, r.body]));
  }
}
