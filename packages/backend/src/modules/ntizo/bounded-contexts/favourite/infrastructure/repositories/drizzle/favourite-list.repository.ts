import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import {
  favouriteList,
  type FavouriteListRow,
  type NewFavouriteListRow,
} from "../../../../../shared/infrastructure/database/favourite/schemas";
import type { FavouriteListRepositoryPort } from "../../../app/ports/outbound/favourite-list.repository.port";
import { FavouriteList } from "../../../domain/aggregates/favourite-list.aggregate";
import { ListNameTakenError } from "../../../domain/exceptions";

/**
 * A stored row as the aggregate.
 *
 * Every field is copied into an explicit literal — never
 * `FavouriteList.rehydrate(row)` with the row passed straight through.
 * TypeScript's excess-property check only fires on a fresh object literal, so
 * handing a `select()` row across by reference would let a column added later
 * ride along into the aggregate silently, with nothing here to catch it. The
 * same rule `DrizzleActivityRepository` writes down.
 */
function toAggregate(row: FavouriteListRow): FavouriteList {
  return FavouriteList.rehydrate({
    id: row.id,
    userId: row.userId,
    name: row.name,
    isDefault: row.isDefault,
    createdAt: row.createdAt,
  });
}

/**
 * The insert half of {@link DrizzleFavouriteListRepository.ensureDefault}.
 *
 * A module-level export, not a private method: a test asserts on the
 * generated SQL through drizzle's `.toSQL()`, and a method buried in the
 * class gives that test no seam to call. The same shape
 * `catalog/…/service-read.repository.ts` uses for `conditionsFor`.
 */
export function buildEnsureDefaultInsert(db: ReturnType<typeof getDb>, userId: string, now: Date) {
  const values: NewFavouriteListRow = { userId, name: null, isDefault: true, createdAt: now };
  return (
    db
      .insert(favouriteList)
      .values(values)
      /*
       * Untargeted, and unambiguous even so. Of this table's four unique
       * constraints, three cannot fire for this row: `id` is a fresh random
       * uuid, `(id, user_id)` follows it, and `favourite_list_user_name_uq` is
       * on `lower(name)` — which is NULL here, and NULLs are distinct in a
       * unique index. What is left is `favourite_list_one_default_uq`, the
       * partial index this statement is aimed at, so "do nothing on a
       * conflict" can only ever mean "somebody else already made the
       * default". Naming the target explicitly would mean spelling the
       * index's `WHERE is_default` predicate back at Postgres for it to prove
       * equivalent, which buys nothing here and breaks quietly if the
       * predicate is ever reworded.
       */
      .onConflictDoNothing()
  );
}

/**
 * The unique index Task 1 built, on `(user_id, lower(name))`. See
 * `favourite-list.schema.ts`.
 */
const LIST_NAME_UNIQUE_CONSTRAINT = "favourite_list_user_name_uq";

/**
 * postgres.js surfaces a unique-index violation as SQLSTATE `23505`, and the
 * `constraint_name` on that error is the index's own name — Postgres does
 * not send a rendered message an application should ever parse. Matching on
 * both together, not the name alone, is what `DrizzleBookingRepository`'s
 * `isSlotCollision` does for the same reason: `code` establishes this is a
 * uniqueness violation at all, and `constraint_name` establishes it is
 * *this* one — `save` and `rename` are the only writers of this table, and
 * `favourite_list_user_name_uq` is the only one of its four unique
 * constraints either can plausibly hit (`id` and `(id, user_id)` are on a
 * fresh random uuid, and the one-default partial index is `ensureDefault`'s
 * problem, not this one's).
 *
 * Two callers, not a `try`/`catch` inlined into each: `CreateListCommand`
 * and `RenameListCommand` already run the same case-insensitive check
 * against `listForUser` before ever reaching here, so this only ever fires
 * on the race that check cannot close by itself — two tabs naming a list
 * "Casa nova" at the same instant. Without this, that race would surface a
 * raw `23505` as a 500 instead of the same `ListNameTakenError` the
 * read-first check already gives everybody else. See `ListNameTakenError`'s
 * own doc comment: the check is for the message, this translation is what
 * makes the index the truth without ever leaking as itself.
 */
function isNameCollision(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  const constraintName = (error as { constraint_name?: unknown }).constraint_name;
  return code === "23505" && constraintName === LIST_NAME_UNIQUE_CONSTRAINT;
}

export class DrizzleFavouriteListRepository implements FavouriteListRepositoryPort {
  /**
   * The default list, created on first use.
   *
   * `INSERT … ON CONFLICT DO NOTHING` against the one-default partial unique
   * index, then read — never a SELECT and a decision. Read-then-write loses to
   * the same person in two tabs: both see "no default", both insert, and one
   * gets a constraint violation on their very first save, which reads as the
   * heart being broken.
   *
   * The read is what makes the conflicting branch correct: whichever tab lost
   * the insert still comes away holding the list the winner created, so both
   * callers return the same list and neither has to know which of them wrote
   * it.
   */
  async ensureDefault(userId: string, now: Date): Promise<FavouriteList> {
    await buildEnsureDefaultInsert(getDb(), userId, now);

    const [row] = await getDb()
      .select()
      .from(favouriteList)
      .where(and(eq(favouriteList.userId, userId), eq(favouriteList.isDefault, true)))
      .limit(1);

    if (!row) {
      // Unreachable while `favourite_list_one_default_uq` exists: the insert
      // above either wrote this row or lost to somebody who did. Spelled out
      // rather than asserted away with `!`, so the day it is reachable it
      // says what happened instead of throwing on a property of undefined.
      throw new Error(`[favourite] ensureDefault found no default list for "${userId}" after inserting one`);
    }
    return toAggregate(row);
  }

  /**
   * Insert-only — see the port's own doc comment. Only ever reached with a
   * named list (`CreateListCommand` is the one caller, and it always builds
   * through `FavouriteList.create`, which refuses a blank name), so a
   * `favourite_list_user_name_uq` violation here can only mean the name
   * really is taken — see {@link isNameCollision}.
   */
  async save(entity: FavouriteList): Promise<string> {
    const values: NewFavouriteListRow = {
      // `undefined` when the aggregate was made without one, which drizzle
      // renders as `DEFAULT` — the column's own `gen_random_uuid()`.
      id: entity.id,
      userId: entity.userId,
      name: entity.name,
      isDefault: entity.isDefault,
      createdAt: entity.createdAt,
    };
    try {
      const [row] = await getDb().insert(favouriteList).values(values).returning({ id: favouriteList.id });
      if (!row) {
        throw new Error("[favourite] saving a list returned no row");
      }
      return row.id;
    } catch (error) {
      if (isNameCollision(error)) {
        // `entity.name` is never null here — see this method's own doc
        // comment on why `save` is only ever reached with a named list.
        throw new ListNameTakenError(entity.name ?? "");
      }
      throw error;
    }
  }

  /**
   * `user_id` in the WHERE as well as `id`.
   *
   * The command has already checked ownership; this is the second lock on the
   * same door. An id that slipped through updates zero rows rather than
   * renaming a stranger's list.
   *
   * `RenameListCommand` already checked the new name against this person's
   * other lists before calling this, so a `favourite_list_user_name_uq`
   * violation reaching here can only be the race that check cannot close on
   * its own — see {@link isNameCollision}.
   */
  async rename(p: { id: string; userId: string; name: string }): Promise<void> {
    try {
      await getDb()
        .update(favouriteList)
        .set({ name: p.name })
        .where(and(eq(favouriteList.id, p.id), eq(favouriteList.userId, p.userId)));
    } catch (error) {
      if (isNameCollision(error)) {
        throw new ListNameTakenError(p.name);
      }
      throw error;
    }
  }

  /**
   * Deletes the list; its entries go with it through
   * `favourite_list_owner_fk`'s `ON DELETE CASCADE`.
   *
   * `returning` rather than a preceding SELECT: one statement answers both
   * "was it deleted" and "was it theirs", and there is no window between the
   * check and the delete for the row to change owner or disappear.
   */
  async remove(p: { id: string; userId: string }): Promise<boolean> {
    const rows = await getDb()
      .delete(favouriteList)
      .where(and(eq(favouriteList.id, p.id), eq(favouriteList.userId, p.userId)))
      .returning({ id: favouriteList.id });
    return rows.length > 0;
  }

  /**
   * Every list this person has, newest first.
   *
   * The order `favourite_list_user_created_idx` was declared for, so this
   * reads straight off the index. Putting the default list at the top is a
   * presentation choice and belongs to whoever renders the dialog — sorting
   * by `is_default` here would give up the index for a decision this layer
   * has no business making.
   */
  async listForUser(userId: string): Promise<FavouriteList[]> {
    const rows = await getDb()
      .select()
      .from(favouriteList)
      .where(eq(favouriteList.userId, userId))
      .orderBy(desc(favouriteList.createdAt));
    return rows.map(toAggregate);
  }

  async ownedBy(p: { userId: string; listIds: string[] }): Promise<string[]> {
    // `IN ()` is a syntax error, and "no lists selected" is a real request —
    // clearing every tick in the dialog sends exactly this.
    if (p.listIds.length === 0) return [];

    const rows = await getDb()
      .select({ id: favouriteList.id })
      .from(favouriteList)
      .where(and(eq(favouriteList.userId, p.userId), inArray(favouriteList.id, p.listIds)));
    return rows.map((r) => r.id);
  }
}
