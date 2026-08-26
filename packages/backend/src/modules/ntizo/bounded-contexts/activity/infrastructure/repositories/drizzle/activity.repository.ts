import { and, desc, eq, lt, or } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { activity } from "../../../../../shared/infrastructure/database/activity/schemas";
import { Activity } from "../../../domain/aggregates/activity.aggregate";
import type { ActivityPage, ActivityRepositoryPort } from "../../../app/ports/outbound/activity.repository.port";

/**
 * The cursor is `<occurredAt ISO>|<id>`.
 *
 * Two facts, because one is not enough: two events can share a millisecond,
 * and a cursor on time alone would either skip the second or repeat it
 * forever. The id breaks the tie and is unique, so the pair is a total order.
 */
function encodeCursor(occurredAt: Date, id: string): string {
  return `${occurredAt.toISOString()}|${id}`;
}

/**
 * Null on anything that doesn't parse. `listForActor` turns that into a
 * thrown error rather than a silent "start over at page one" — see the
 * comment there for why.
 */
function decodeCursor(cursor: string): { occurredAt: Date; id: string } | null {
  const [when, id] = cursor.split("|");
  if (!when || !id) return null;
  const occurredAt = new Date(when);
  return Number.isNaN(occurredAt.getTime()) ? null : { occurredAt, id };
}

export class DrizzleActivityRepository implements ActivityRepositoryPort {
  async save(entity: Activity): Promise<string> {
    const [row] = await getDb()
      .insert(activity)
      .values({
        actorUserId: entity.actorUserId,
        type: entity.type,
        payload: entity.payload,
        occurredAt: entity.occurredAt,
      })
      .returning({ id: activity.id });
    return row!.id;
  }

  async listForActor(params: {
    actorUserId: string;
    limit: number;
    cursor?: string | null;
  }): Promise<ActivityPage> {
    // A cursor that fails to decode is rejected, not treated as absent.
    // Silently falling back to page one would hand a paginating client the
    // newest page and a fresh `nextCursor` under a cursor it thought was
    // mid-list — nothing distinguishes that from a normal first call, so a
    // client that loops on "cursor in, cursor out" until `nextCursor` is
    // null would loop forever on a truncated or tampered token instead of
    // ever finding out something was wrong.
    let after: { occurredAt: Date; id: string } | null = null;
    if (params.cursor) {
      after = decodeCursor(params.cursor);
      if (!after) {
        throw new Error(`[activity] invalid cursor: ${params.cursor}`);
      }
    }
    // One more than asked for: its existence is what says another page exists,
    // without a second COUNT query that could disagree with this one.
    const rows = await getDb()
      .select()
      .from(activity)
      .where(
        after
          ? and(
              eq(activity.actorUserId, params.actorUserId),
              or(
                lt(activity.occurredAt, after.occurredAt),
                and(eq(activity.occurredAt, after.occurredAt), lt(activity.id, after.id)),
              ),
            )
          : eq(activity.actorUserId, params.actorUserId),
      )
      .orderBy(desc(activity.occurredAt), desc(activity.id))
      .limit(params.limit + 1);

    const hasMore = rows.length > params.limit;
    const page = hasMore ? rows.slice(0, params.limit) : rows;
    const last = page[page.length - 1];

    return {
      // `Activity.rehydrate`, never `Activity.record`: this maps a whole page
      // in one pass, so a type later dropped from `ACTIVITY_TYPES` must not
      // fail the entire page over one unrenderable row.
      //
      // Each row is copied into an explicit literal with exactly these five
      // props — never `Activity.rehydrate(r)` with the row passed straight
      // through. TypeScript's excess-property check only fires on a fresh
      // object literal; handing a `select()` row through by reference would
      // let an extra column (e.g. `createdAt`) ride along into the aggregate
      // silently, with nothing here or in Task 2's tests to catch it.
      items: page.map((r) =>
        Activity.rehydrate({
          id: r.id,
          actorUserId: r.actorUserId,
          type: r.type as Activity["type"],
          payload: r.payload as Record<string, unknown>,
          occurredAt: r.occurredAt,
        }),
      ),
      nextCursor: hasMore && last ? encodeCursor(last.occurredAt, last.id) : null,
    };
  }
}
