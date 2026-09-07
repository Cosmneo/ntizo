import { and, asc, count, desc, eq, inArray, lt, lte, or, sql } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import {
  favourite,
  type FavouriteRow,
  type NewFavouriteRow,
} from "../../../../../shared/infrastructure/database/favourite/schemas";
import type { FavouriteRepositoryPort } from "../../../app/ports/outbound/favourite.repository.port";
import { Favourite } from "../../../domain/aggregates/favourite.aggregate";
import { CursorInvalidError } from "../../../domain/exceptions";
import type { FavouriteTarget } from "../../../domain/favourite-target";

/**
 * The cursor is `<createdAt ISO>|<id>`.
 *
 * Two facts, because one is not enough: two entries filed in the same
 * millisecond — which a "save to all my lists" tap produces on purpose — would
 * make a cursor on time alone either skip the second or repeat it forever. The
 * id breaks the tie and is unique, so the pair is a total order. Copied
 * verbatim from `DrizzleActivityRepository`, whose page has the same shape.
 */
function encodeCursor(createdAt: Date, id: string): string {
  return `${createdAt.toISOString()}|${id}`;
}

/**
 * Null on anything that doesn't parse. `entriesIn` turns that into a thrown
 * error rather than a silent "start over at page one" — see the comment
 * there for why.
 */
function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  const [when, id] = cursor.split("|");
  if (!when || !id) return null;
  const createdAt = new Date(when);
  return Number.isNaN(createdAt.getTime()) ? null : { createdAt, id };
}

/**
 * A stored row as the aggregate.
 *
 * `Favourite.rehydrate`, never `Favourite.file`: this maps a whole page in
 * one pass, so a target type later dropped from `FAVOURITE_TARGETS` must not
 * fail the entire page over one unrenderable row — the reasoning the
 * aggregate's own doc comment sets out.
 *
 * Every field is copied into an explicit literal rather than passing the row
 * through by reference. TypeScript's excess-property check only fires on a
 * fresh object literal, so a column added to the table later would otherwise
 * ride into the aggregate silently.
 */
function toAggregate(row: FavouriteRow): Favourite {
  return Favourite.rehydrate({
    id: row.id,
    listId: row.listId,
    userId: row.userId,
    targetType: row.targetType as FavouriteTarget,
    targetId: row.targetId,
    createdAt: row.createdAt,
  });
}

/*
 * The four builders below are module-level exports rather than private
 * methods because a test asserts on their generated SQL through drizzle's
 * `.toSQL()`, and a method buried in the class gives that test no seam to
 * call it from. The same shape `catalog/…/service-read.repository.ts` uses
 * for `conditionsFor`.
 */

/**
 * The removal half of {@link DrizzleFavouriteRepository.setLists}: every row
 * for this target that is *not* in the ticked lists.
 *
 * `<> ALL(array[…])` and not `NOT IN (a, b, c)`, because of the empty case.
 * Unticking the last list sends no ids at all, and `NOT IN ()` is a syntax
 * error — drizzle's own `notInArray` sidesteps it by quietly returning
 * `true`, a special case that lives in the library rather than here.
 * `<> ALL(array[]::uuid[])` is simply true of every row on its own terms, so
 * "in none of my lists" needs no second branch and reads as what it is:
 * remove this listing from everywhere.
 *
 * Every id is its own bound parameter inside the ARRAY constructor, rather
 * than one array-valued parameter (`<> ALL($4::uuid[])`). That shorter form
 * does not work: postgres-js infers a type per parameter and has none for a
 * plain JS array, so it serialises `["l1","l2"]` with `'' + x` — a
 * comma-joined string with no braces — and Postgres rejects it with
 * `malformed array literal`. Verified against the dev instance before this
 * was written; the shape is not interchangeable.
 *
 * `user_id` is in the WHERE alongside the target. The command has already
 * checked ownership; this is the second lock on the same door, so a listId
 * that slipped through deletes nothing rather than emptying a stranger's
 * list.
 */
export function buildSetListsDelete(
  db: ReturnType<typeof getDb>,
  p: { userId: string; targetType: FavouriteTarget; targetId: string; listIds: string[] },
) {
  const kept = sql.join(
    p.listIds.map((listId) => sql`${listId}`),
    sql`, `,
  );
  return db.delete(favourite).where(
    and(
      eq(favourite.userId, p.userId),
      eq(favourite.targetType, p.targetType),
      eq(favourite.targetId, p.targetId),
      // `::uuid[]` spelled out rather than left to inference: with no ids at
      // all, `array[]` on its own is a type Postgres refuses to guess.
      sql`${favourite.listId} <> all(array[${kept}]::uuid[])`,
    ),
  );
}

/**
 * The addition half of {@link DrizzleFavouriteRepository.setLists}: one
 * multi-row INSERT, whatever the number of lists.
 *
 * `ON CONFLICT DO NOTHING` rather than delete-all-then-insert. The latter
 * loses every surviving row's `createdAt` — the key the list is drawn in
 * order of — so a list would reorder itself every time somebody opened the
 * dialog and closed it again without changing anything.
 *
 * Callers must not pass an empty `listIds`: drizzle's `values()` rejects an
 * empty array, and there is nothing to insert anyway. `setLists` skips this
 * statement entirely in that case.
 */
export function buildSetListsInsert(
  db: ReturnType<typeof getDb>,
  p: { userId: string; targetType: FavouriteTarget; targetId: string; listIds: string[]; now: Date },
) {
  const rows: NewFavouriteRow[] = p.listIds.map((listId) => ({
    listId,
    userId: p.userId,
    targetType: p.targetType,
    targetId: p.targetId,
    createdAt: p.now,
  }));
  return db.insert(favourite).values(rows).onConflictDoNothing();
}

/**
 * "Which of these listings has this person saved anywhere."
 *
 * `selectDistinct`, because a listing in three lists is three rows and one
 * answer. De-duplicating on the client would hide nothing, but the payload
 * for a page of twenty-four cards would be three times the size for the same
 * fact.
 */
export function buildMarkedForQuery(
  db: ReturnType<typeof getDb>,
  p: { userId: string; targetType: FavouriteTarget; targetIds: string[] },
) {
  return db
    .selectDistinct({ targetId: favourite.targetId })
    .from(favourite)
    .where(
      and(
        eq(favourite.userId, p.userId),
        eq(favourite.targetType, p.targetType),
        inArray(favourite.targetId, p.targetIds),
      ),
    );
}

/**
 * The newest `perList` entries of each list, in one statement.
 *
 * `row_number() over (partition by list_id order by created_at desc)`
 * filtered to `<= perList`: four cover tiles for twelve lists is one query
 * rather than twelve, which is the difference between one round trip and
 * twelve on the page that shows every list at once.
 *
 * The outer `ORDER BY` is not decoration. Without it Postgres may return the
 * ranked rows in any order it likes, and the mosaic would shuffle its tiles
 * between two renders of the same unchanged list.
 */
export function buildCoverTargetsQuery(db: ReturnType<typeof getDb>, p: { listIds: string[]; perList: number }) {
  const ranked = db
    .select({
      listId: favourite.listId,
      targetType: favourite.targetType,
      targetId: favourite.targetId,
      rank: sql<number>`row_number() over (partition by ${favourite.listId} order by ${favourite.createdAt} desc)`.as(
        "rank",
      ),
    })
    .from(favourite)
    .where(inArray(favourite.listId, p.listIds))
    .as("ranked");

  return db
    .select({ listId: ranked.listId, targetType: ranked.targetType, targetId: ranked.targetId })
    .from(ranked)
    .where(lte(ranked.rank, p.perList))
    .orderBy(asc(ranked.listId), asc(ranked.rank));
}

/**
 * One page of a list's entries, newest first, keyed off the cursor rather
 * than an offset.
 *
 * Takes the cursor already decoded: decoding can fail, and failing belongs
 * where the refusal is thrown, not inside a query builder a test calls to
 * read SQL out of.
 */
export function buildEntriesInQuery(
  db: ReturnType<typeof getDb>,
  p: { listId: string; limit: number; after: { createdAt: Date; id: string } | null },
) {
  const { after } = p;
  return (
    db
      .select()
      .from(favourite)
      .where(
        after
          ? and(
              eq(favourite.listId, p.listId),
              or(
                lt(favourite.createdAt, after.createdAt),
                and(eq(favourite.createdAt, after.createdAt), lt(favourite.id, after.id)),
              ),
            )
          : eq(favourite.listId, p.listId),
      )
      .orderBy(desc(favourite.createdAt), desc(favourite.id))
      // One more than asked for: its existence is what says another page
      // exists, without a second COUNT query that could disagree with this
      // one.
      .limit(p.limit + 1)
  );
}

export class DrizzleFavouriteRepository implements FavouriteRepositoryPort {
  /**
   * `ON CONFLICT DO NOTHING`, because a double-tap is not an error.
   *
   * For an aggregate with no id of its own — every caller in this context —
   * the only unique constraint the row can hit is
   * `favourite_list_target_uq`, the same listing twice in one list, and the
   * right answer to that is "it is already there", not a failure the person
   * reads as the heart being broken. A caller that supplied its own `id`
   * would also have a primary-key collision swallowed here, which is a reason
   * not to supply one rather than a reason to name the conflict target: doing
   * that would mean spelling a constraint's columns back at Postgres in a
   * second place that can drift from the schema.
   */
  async add(entity: Favourite): Promise<void> {
    const values: NewFavouriteRow = {
      // `undefined` when the aggregate was made without one, which drizzle
      // renders as `DEFAULT` — the column's own `gen_random_uuid()`.
      id: entity.id,
      listId: entity.listId,
      userId: entity.userId,
      targetType: entity.targetType,
      targetId: entity.targetId,
      createdAt: entity.createdAt,
    };
    await getDb().insert(favourite).values(values).onConflictDoNothing();
  }

  /**
   * Exactly which of this person's lists hold this listing, after this call.
   *
   * Two statements inside one transaction: a delete of what is no longer
   * ticked and an insert of what now is. Half-applied it would leave the
   * listing in lists nobody chose, and the dialog would show one thing while
   * the lists showed another with no way to tell which is right.
   *
   * Two statements whatever the number of lists — somebody with twelve lists
   * ticking three costs two round trips, not fifteen. And a diff rather than
   * a reset: see {@link buildSetListsInsert} for what delete-all-then-insert
   * would cost.
   *
   * `getDb().transaction(...)`, the way every other repository in this
   * codebase opens one. `getDb()` already resolves to an enclosing
   * transaction when a use case opened one, so this composes with a caller's
   * unit of work instead of competing with it.
   */
  async setLists(p: {
    userId: string;
    targetType: FavouriteTarget;
    targetId: string;
    listIds: string[];
    now: Date;
  }): Promise<void> {
    await getDb().transaction(async (tx) => {
      // `tx` is a PgTransaction: structurally close to, but not assignable
      // to, the handle type — it has no `$client`. It supports the whole
      // query surface these two builders use, so the cast is safe. The same
      // cast `tx-context` makes when it binds a transaction into
      // AsyncLocalStorage.
      const inTx = tx as unknown as ReturnType<typeof getDb>;

      await buildSetListsDelete(inTx, p);
      // Skipped when nothing is ticked: drizzle's `values()` rejects an empty
      // array, and the delete above has already removed every row for the
      // target — which is what "in none of my lists" means.
      if (p.listIds.length > 0) {
        await buildSetListsInsert(inTx, p);
      }
    });
  }

  async listsFor(p: { userId: string; targetType: FavouriteTarget; targetId: string }): Promise<string[]> {
    const rows = await getDb()
      .select({ listId: favourite.listId })
      .from(favourite)
      .where(
        and(
          eq(favourite.userId, p.userId),
          eq(favourite.targetType, p.targetType),
          eq(favourite.targetId, p.targetId),
        ),
      );
    return rows.map((r) => r.listId);
  }

  async markedFor(p: { userId: string; targetType: FavouriteTarget; targetIds: string[] }): Promise<string[]> {
    // `IN ()` is a syntax error, and an empty page of cards is a real case —
    // a search with no results asks this question with nothing in it.
    if (p.targetIds.length === 0) return [];

    const rows = await buildMarkedForQuery(getDb(), p);
    return rows.map((r) => r.targetId);
  }

  async countsFor(listIds: string[]): Promise<Map<string, number>> {
    // Same `IN ()` guard: a person with no lists at all reaches this.
    if (listIds.length === 0) return new Map();

    const rows = await getDb()
      .select({ listId: favourite.listId, n: count() })
      .from(favourite)
      .where(inArray(favourite.listId, listIds))
      .groupBy(favourite.listId);
    // A list with no entries has no row to group, so it is simply absent —
    // the port says to read this as `?? 0` rather than trusting `.size`.
    return new Map(rows.map((r) => [r.listId, Number(r.n)]));
  }

  async coverTargetsFor(p: {
    listIds: string[];
    perList: number;
  }): Promise<Map<string, { targetType: FavouriteTarget; targetId: string }[]>> {
    // Same `IN ()` guard as the two above.
    if (p.listIds.length === 0) return new Map();

    const rows = await buildCoverTargetsQuery(getDb(), p);

    const byList = new Map<string, { targetType: FavouriteTarget; targetId: string }[]>();
    for (const row of rows) {
      const tiles = byList.get(row.listId) ?? [];
      tiles.push({ targetType: row.targetType as FavouriteTarget, targetId: row.targetId });
      byList.set(row.listId, tiles);
    }
    return byList;
  }

  async entriesIn(p: {
    listId: string;
    limit: number;
    cursor?: string | null;
  }): Promise<{ items: Favourite[]; nextCursor: string | null }> {
    // A cursor that fails to decode is rejected, not treated as absent.
    // Silently falling back to page one would hand a paginating client the
    // newest page and a fresh `nextCursor` under a cursor it thought was
    // mid-list — nothing distinguishes that from a normal first call, so a
    // client that loops on "cursor in, cursor out" until `nextCursor` is null
    // would loop forever on a truncated or tampered token instead of ever
    // finding out something was wrong.
    //
    // This is a deliberate trade, not a free improvement: a cursor is an
    // opaque string a client holds between requests, so if the
    // `<createdAt ISO>|<id>` encoding above ever changes, every
    // previously-issued cursor becomes undecodable at once and every holder
    // hard-errors together rather than quietly restarting. A loud,
    // simultaneous failure on a format change is still the outcome to want —
    // but it is the consequence of picking this over silence, not a side
    // effect nobody decided.
    let after: { createdAt: Date; id: string } | null = null;
    if (p.cursor) {
      after = decodeCursor(p.cursor);
      if (!after) {
        throw new CursorInvalidError(p.cursor);
      }
    }

    const rows = await buildEntriesInQuery(getDb(), { listId: p.listId, limit: p.limit, after });

    const hasMore = rows.length > p.limit;
    const page = hasMore ? rows.slice(0, p.limit) : rows;
    const last = page[page.length - 1];

    return {
      items: page.map(toAggregate),
      nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }
}
