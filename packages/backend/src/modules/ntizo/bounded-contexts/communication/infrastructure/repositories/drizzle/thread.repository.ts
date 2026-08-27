import { and, desc, eq, exists, lt, or, sql } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import {
  thread,
  type ThreadRow,
} from "../../../../../shared/infrastructure/database/communication/schemas";
import { providerMember } from "../../../../../shared/infrastructure/database/provider/schemas";
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
   * `(xmax = 0)` reports what *this* statement did — zero on a row it
   * inserted, non-zero on one the `DO UPDATE` touched — rather than what some
   * earlier read happened to see. postgres.js marshals it as a real boolean.
   */
  async openOrFind(customerUserId: string, providerId: string, now: Date): Promise<ThreadOpenResult> {
    const [row] = await getDb()
      .insert(thread)
      .values({ type: "inquiry", customerUserId, providerId, lastMessageAt: now })
      .onConflictDoUpdate({
        target: [thread.customerUserId, thread.providerId],
        targetWhere: sql`${thread.type} = 'inquiry'`,
        set: { lastMessageAt: now },
      })
      .returning({ id: thread.id, inserted: sql<boolean>`(xmax = 0)` });
    return { id: row!.id, created: row!.inserted };
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
          or(
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
          ),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async listForCustomer(customerUserId: string, limit: number, cursor: string | null): Promise<ThreadPage> {
    return this.list(eq(thread.customerUserId, customerUserId), limit, cursor);
  }

  async listForProvider(providerId: string, limit: number, cursor: string | null): Promise<ThreadPage> {
    return this.list(eq(thread.providerId, providerId), limit, cursor);
  }

  private async list(
    scope: ReturnType<typeof eq>,
    limit: number,
    cursor: string | null,
  ): Promise<ThreadPage> {
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
