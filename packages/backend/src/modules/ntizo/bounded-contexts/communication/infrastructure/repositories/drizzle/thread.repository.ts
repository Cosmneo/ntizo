import { and, desc, eq, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { visibleToViewer } from "./thread-visibility";
import type { ThreadType } from "../../../../../shared/infrastructure/database/communication/enums";
import {
  thread,
  type ThreadRow,
} from "../../../../../shared/infrastructure/database/communication/schemas";
import { Thread } from "../../../domain/aggregates/thread.aggregate";
import { CursorInvalidError } from "../../../domain/exceptions";
import type {
  ThreadOpenResult,
  ThreadPage,
  ThreadRepositoryPort,
} from "../../../app/ports/outbound/thread.repository.port";

/**
 * The cursor is `<lastMessageAt ISO>|<id>` — same shape as the activity feed's,
 * for the same reason: two threads can share a `last_message_at` (two
 * conversations touched in the same transaction, or simply the same
 * millisecond), and a cursor on time alone would skip or repeat the second one
 * at a page boundary. The id breaks the tie and is unique, so the pair is a
 * total order.
 */
function encodeCursor(lastMessageAt: Date, id: string): string {
  return `${lastMessageAt.toISOString()}|${id}`;
}

/**
 * Null on anything that doesn't parse. Callers turn that into a thrown
 * `CursorInvalidError` rather than silently starting over at page one — see
 * `activity.repository.ts`'s `decodeCursor` for the full argument, which
 * applies unchanged here.
 */
function decodeCursor(cursor: string): { lastMessageAt: Date; id: string } | null {
  const [when, id] = cursor.split("|");
  if (!when || !id) return null;
  const lastMessageAt = new Date(when);
  return Number.isNaN(lastMessageAt.getTime()) ? null : { lastMessageAt, id };
}

export class DrizzleThreadRepository implements ThreadRepositoryPort {
  /**
   * `ON CONFLICT`, not `SELECT` then a conditional `INSERT`: two messages sent
   * at the same instant must not produce two threads, and a decision made from
   * a read taken outside this statement is a decision made from a fact that
   * can already be stale by the time the write happens.
   *
   * The target must match the index Postgres actually has —
   * `thread_customer_provider_uq` is partial (`where type = 'inquiry'`), so
   * `targetWhere` carries that same predicate. Without it Postgres has no
   * unique constraint matching the plain `(customer_user_id, provider_id)`
   * target and the statement raises instead of resolving.
   *
   * The conflict branch's `SET` is a deliberate no-op — `last_message_at =
   * thread.last_message_at`, the existing row's own value, not `now`.
   * `openOrFind` is only ever called by `StartThreadCommand`, and a customer
   * can call that by simply opening (or re-opening) a conversation, with no
   * message sent — `provider-hero.tsx`'s "message this provider" button does
   * exactly that on every click. Bumping `last_message_at` here would reorder
   * both inboxes and surface an empty, unread-free row above a real
   * conversation for nothing more than a click that wrote nothing. The one
   * place `last_message_at` is meant to move is `touch()`, called from
   * `SendMessageCommand` in the same transaction as the message that earned
   * the reorder.
   *
   * `(xmax = 0)` reports what *this* statement did — zero on a row it
   * inserted, non-zero on one the `DO UPDATE` touched — rather than what some
   * earlier read happened to see. postgres.js marshals it as a real boolean.
   * This still works with a no-op `SET`: the flag reflects which branch of
   * `ON CONFLICT` executed, not whether the assignment changed a value.
   */
  async openOrFind(customerUserId: string, providerId: string, now: Date): Promise<ThreadOpenResult> {
    const [row] = await getDb()
      .insert(thread)
      .values({ type: "inquiry", customerUserId, providerId, lastMessageAt: now })
      .onConflictDoUpdate({
        target: [thread.customerUserId, thread.providerId],
        targetWhere: sql`${thread.type} = 'inquiry'`,
        set: { lastMessageAt: sql`${thread.lastMessageAt}` },
      })
      .returning({ id: thread.id, inserted: sql<boolean>`(xmax = 0)` });
    return { id: row!.id, created: row!.inserted };
  }

  /** A plain insert — see the port. `lastMessageAt = now`: the first message lands in the same transaction. */
  async openSupport(customerUserId: string, providerId: string | null, now: Date): Promise<string> {
    const [row] = await getDb()
      .insert(thread)
      .values({ type: "support", customerUserId, providerId, lastMessageAt: now })
      .returning({ id: thread.id });
    return row!.id;
  }

  /** `type = 'support'` is the whole scope — no viewer, see the port. */
  async findSupportThread(threadId: string): Promise<ThreadRow | null> {
    const [row] = await getDb()
      .select()
      .from(thread)
      .where(and(eq(thread.id, threadId), eq(thread.type, "support")))
      .limit(1);
    return row ?? null;
  }

  async touch(threadId: string, at: Date): Promise<void> {
    await getDb().update(thread).set({ lastMessageAt: at }).where(eq(thread.id, threadId));
  }

  /**
   * Visible to the customer on the thread, or to any member of its provider —
   * `provider_member` row existing for `(provider_id, viewerUserId)` is the
   * whole test, same predicate `DrizzleProviderMemberReader` uses in the
   * notification context. Null for both "no such thread" and "not yours": an
   * attacker probing thread ids must not learn which ids are real.
   */
  async findVisible(threadId: string, viewerUserId: string): Promise<ThreadRow | null> {
    const [row] = await getDb()
      .select()
      .from(thread)
      .where(
        and(
          eq(thread.id, threadId),
          visibleToViewer(viewerUserId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  /**
   * Personal only: `type = 'inquiry'`, or a support thread with no
   * provider. A provider request the same person opened on the provider's
   * behalf has `customer_user_id = this person` too — that row is the
   * provider's, not theirs, and listing it here would put the provider's
   * business in a personal inbox.
   */
  async listForCustomer(customerUserId: string, limit: number, cursor: string | null, type?: ThreadType): Promise<ThreadPage> {
    return this.list(
      and(
        eq(thread.customerUserId, customerUserId),
        or(eq(thread.type, "inquiry"), isNull(thread.providerId)),
        type ? eq(thread.type, type) : undefined,
      ),
      limit,
      cursor,
    );
  }

  async listForProvider(providerId: string, limit: number, cursor: string | null, type?: ThreadType): Promise<ThreadPage> {
    return this.list(and(eq(thread.providerId, providerId), type ? eq(thread.type, type) : undefined), limit, cursor);
  }

  private async list(scope: SQL | undefined, limit: number, cursor: string | null): Promise<ThreadPage> {
    // A cursor that fails to decode is rejected, not treated as absent — see
    // `activity.repository.ts`'s `listForActor` for why silently falling back
    // to page one is the wrong failure mode for a client that pages by
    // following `nextCursor` until it sees null.
    let after: { lastMessageAt: Date; id: string } | null = null;
    if (cursor) {
      after = decodeCursor(cursor);
      if (!after) {
        throw new CursorInvalidError(cursor);
      }
    }

    // One more than asked for: its existence is what says another page
    // exists, without a second COUNT query that could disagree with this one.
    const rows = await getDb()
      .select()
      .from(thread)
      .where(
        after
          ? and(
              scope,
              or(
                lt(thread.lastMessageAt, after.lastMessageAt),
                and(eq(thread.lastMessageAt, after.lastMessageAt), lt(thread.id, after.id)),
              ),
            )
          : scope,
      )
      .orderBy(desc(thread.lastMessageAt), desc(thread.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];

    return {
      // `Thread.rehydrate`, never `Thread.open`: this maps a stored page back
      // as-is, and re-validating `type` against today's `THREAD_TYPES` on
      // every read would mean a future addition to that list invalidates
      // every row written before the addition. Each row is copied into an
      // explicit literal — never `Thread.rehydrate(r)` with the row passed
      // through — so TypeScript's excess-property check catches a column
      // that rides along by accident.
      items: page.map((r) =>
        Thread.rehydrate({
          id: r.id,
          type: r.type as Thread["type"],
          customerUserId: r.customerUserId,
          providerId: r.providerId,
          lastMessageAt: r.lastMessageAt,
          createdAt: r.createdAt,
        }),
      ),
      nextCursor: hasMore && last ? encodeCursor(last.lastMessageAt, last.id) : null,
    };
  }
}
