import { and, asc, count, desc, eq, inArray, isNotNull, isNull, lt, lte, ne, or } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { message, thread } from "../../../../../shared/infrastructure/database/communication/schemas";
import { Message } from "../../../domain/aggregates/message.aggregate";
import { CursorInvalidError } from "../../../domain/exceptions";
import type {
  DueMessage,
  MessagePage,
  MessageRepositoryPort,
} from "../../../app/ports/outbound/message.repository.port";

/**
 * The cursor is `<createdAt ISO>|<id>` — same shape as the activity feed's
 * and `thread.repository.ts`'s, for the same reason: two messages can share a
 * `created_at` (it defaults to `now()`, which Postgres resolves once per
 * transaction), and a cursor on time alone would skip or repeat the tied row
 * at a page boundary.
 */
function encodeCursor(createdAt: Date, id: string): string {
  return `${createdAt.toISOString()}|${id}`;
}

/** Null on anything that doesn't parse — see `thread.repository.ts`'s `decodeCursor`. */
function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  const [when, id] = cursor.split("|");
  if (!when || !id) return null;
  const createdAt = new Date(when);
  return Number.isNaN(createdAt.getTime()) ? null : { createdAt, id };
}

/**
 * A message sent by the thread's customer, expressed as a where-fragment
 * factory: `markReadForViewer` and `countUnreadForViewer` both need "is this
 * message from the side `viewerUserId` is *not* on", resolved against
 * `thread.customer_user_id` rather than against `viewerUserId` directly — a
 * provider member reading must not also mark a teammate's own sent message as
 * read. Both call sites join `message` to `thread`, so both can share this.
 */
function fromTheOtherSide(viewerUserId: string) {
  return or(
    and(eq(thread.customerUserId, viewerUserId), ne(message.senderUserId, thread.customerUserId)),
    and(ne(thread.customerUserId, viewerUserId), eq(message.senderUserId, thread.customerUserId)),
  );
}

export class DrizzleMessageRepository implements MessageRepositoryPort {
  /** `entity` already carries its `threadId` — see the port doc comment. */
  async insert(entity: Message): Promise<string> {
    const [row] = await getDb()
      .insert(message)
      .values({
        threadId: entity.threadId,
        senderUserId: entity.senderUserId,
        body: entity.body,
        readAt: entity.readAt,
        notifyDueAt: entity.notifyDueAt,
        notifiedAt: entity.notifiedAt,
        createdAt: entity.createdAt,
      })
      .returning({ id: message.id });
    return row!.id;
  }

  async listForThread(threadId: string, limit: number, cursor: string | null): Promise<MessagePage> {
    let after: { createdAt: Date; id: string } | null = null;
    if (cursor) {
      after = decodeCursor(cursor);
      if (!after) {
        throw new CursorInvalidError(cursor);
      }
    }

    const rows = await getDb()
      .select()
      .from(message)
      .where(
        after
          ? and(
              eq(message.threadId, threadId),
              or(
                lt(message.createdAt, after.createdAt),
                and(eq(message.createdAt, after.createdAt), lt(message.id, after.id)),
              ),
            )
          : eq(message.threadId, threadId),
      )
      .orderBy(desc(message.createdAt), desc(message.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];

    return {
      // `Message.rehydrate`, never `Message.compose`: a stored row was valid
      // under whatever rule was in force when it was written, and
      // re-validating it against today's `MESSAGE_BODY_MAX` on every read
      // would break older rows a rule tightened later was never meant to
      // touch. Copied into an explicit literal, not passed through, so
      // TypeScript's excess-property check catches a column riding along by
      // accident.
      items: page.map((r) =>
        Message.rehydrate({
          id: r.id,
          threadId: r.threadId,
          senderUserId: r.senderUserId,
          body: r.body,
          readAt: r.readAt,
          notifyDueAt: r.notifyDueAt,
          notifiedAt: r.notifiedAt,
          createdAt: r.createdAt,
        }),
      ),
      nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  /**
   * `UPDATE ... FROM thread`, not a plain `UPDATE message`: which messages
   * count as "the other side" depends on the thread's `customer_user_id`, so
   * the join has to be in the statement doing the writing, not resolved by a
   * caller beforehand.
   */
  async markReadForViewer(threadId: string, viewerUserId: string, at: Date): Promise<number> {
    const rows = await getDb()
      .update(message)
      .set({ readAt: at })
      .from(thread)
      .where(
        and(
          eq(message.threadId, thread.id),
          eq(message.threadId, threadId),
          isNull(message.readAt),
          fromTheOtherSide(viewerUserId),
        ),
      )
      .returning({ id: message.id });
    return rows.length;
  }

  /** Due, unread, un-notified — the `idx_message_notify_due` partial index's exact predicate. */
  async claimDueForNotice(limit: number, now: Date): Promise<DueMessage[]> {
    return await getDb()
      .select({
        id: message.id,
        threadId: message.threadId,
        senderUserId: message.senderUserId,
        customerUserId: thread.customerUserId,
        providerId: thread.providerId,
      })
      .from(message)
      .innerJoin(thread, eq(thread.id, message.threadId))
      .where(
        and(
          isNotNull(message.notifyDueAt),
          lte(message.notifyDueAt, now),
          isNull(message.readAt),
          isNull(message.notifiedAt),
        ),
      )
      .orderBy(asc(message.notifyDueAt))
      .limit(limit);
  }

  async markNotified(messageId: string, at: Date): Promise<void> {
    await getDb().update(message).set({ notifiedAt: at }).where(eq(message.id, messageId));
  }

  /** One query for the whole page — see the port doc comment for why a per-thread loop is wrong. */
  async countUnreadForViewer(threadIds: string[], viewerUserId: string): Promise<Map<string, number>> {
    if (threadIds.length === 0) return new Map();

    const rows = await getDb()
      .select({ threadId: message.threadId, value: count() })
      .from(message)
      .innerJoin(thread, eq(thread.id, message.threadId))
      .where(and(inArray(message.threadId, threadIds), isNull(message.readAt), fromTheOtherSide(viewerUserId)))
      .groupBy(message.threadId);

    return new Map(rows.map((r) => [r.threadId, r.value]));
  }
}
