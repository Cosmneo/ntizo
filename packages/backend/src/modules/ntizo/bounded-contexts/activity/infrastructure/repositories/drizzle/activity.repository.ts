import { and, desc, eq, lt, or } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { activity } from "../../../../../shared/infrastructure/database/activity/schemas/activity.schema";
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
    const after = params.cursor ? decodeCursor(params.cursor) : null;
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
