import { describe, expect, it } from "bun:test";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { DrizzleDb } from "../../../../../shared/infrastructure/database/connection";
import { __runWithTransactionContextForTests } from "../../../../../shared/infrastructure/database/tx-context";
import { CursorInvalidError } from "../domain/exceptions";
import {
  DrizzleFavouriteListRepository,
  buildEnsureDefaultInsert,
} from "../infrastructure/repositories/drizzle/favourite-list.repository";
import {
  DrizzleFavouriteRepository,
  buildCoverTargetsQuery,
  buildEntriesInQuery,
  buildMarkedForQuery,
  buildSetListsDelete,
  buildSetListsInsert,
} from "../infrastructure/repositories/drizzle/favourite.repository";

/**
 * The SQL these repositories generate, not a live database.
 *
 * `postgres()` connects lazily — building this client and calling `.toSQL()`
 * on a query never opens a socket, so this asserts the statement text exactly
 * as a real Postgres would receive it, without the cost or the flakiness of
 * one. The same seam `catalog/__tests__/service-read.repository.test.ts`
 * uses.
 */
const db = drizzle(postgres("postgres://user:pass@localhost:5999/nonexistent", { prepare: false, max: 1 }));

/**
 * The one clause under test, cut out of the statement around it.
 *
 * Asserting on the whole `.toSQL()` text is what makes this kind of test
 * vacuous: drizzle names every column of the table in an INSERT's column
 * list, so `"user_id"` is already in the string before any WHERE is built.
 * Cutting at the keyword leaves only the clause — and a clause that is not
 * emitted at all throws here rather than silently slicing from the end of the
 * string, which is the shape a "simplified away" WHERE would take. Lifted
 * from `catalog/__tests__/service-read.repository.test.ts`.
 */
function clauseOf(sql: string, keyword: " where " | "order by"): string {
  const at = sql.toLowerCase().indexOf(keyword);
  if (at === -1) throw new Error(`no \`${keyword.trim()}\` in: ${sql}`);
  return sql.toLowerCase().slice(at);
}

/**
 * A handle that records the statements a repository issues, in order, and
 * whether each went through the outer connection or through the transaction.
 *
 * Bound with `__runWithTransactionContextForTests`, which is what `getDb()`
 * resolves to — so this observes the repository's real control flow rather
 * than a hand-injected double the repository was written around.
 */
function recordingDb(rows: unknown[] = []): { db: DrizzleDb; calls: string[] } {
  const calls: string[] = [];

  /**
   * A builder that is awaitable at every step, the way drizzle's are: `.where()`
   * resolves on its own, and so does the `.limit()` after it. Modelling that
   * faithfully is what stops this double from only working for the exact chain
   * it was written against.
   */
  function chain(steps: readonly string[]): Record<string, unknown> {
    const node: Record<string, unknown> = {
      then: (onFulfilled?: (v: unknown[]) => unknown, onRejected?: (e: unknown) => unknown) =>
        Promise.resolve(rows).then(onFulfilled, onRejected),
    };
    for (const step of steps) node[step] = () => chain(steps);
    return node;
  }

  const insertOn = (via: string) => (_table: unknown) => {
    calls.push(`${via}.insert`);
    return {
      values: (v: unknown) => {
        calls.push(`${via}.insert.values:${Array.isArray(v) ? v.length : 1}`);
        return chain(["onConflictDoNothing", "onConflictDoUpdate", "returning"]);
      },
    };
  };

  const deleteOn = (via: string) => (_table: unknown) => {
    calls.push(`${via}.delete`);
    return chain(["where", "returning"]);
  };

  const selectOn = (via: string) => (_fields?: unknown) => {
    calls.push(`${via}.select`);
    return chain(["from", "where", "orderBy", "groupBy", "limit"]);
  };

  const tx = { insert: insertOn("tx"), delete: deleteOn("tx"), select: selectOn("tx") };

  const handle = {
    insert: insertOn("db"),
    delete: deleteOn("db"),
    select: selectOn("db"),
    selectDistinct: selectOn("db"),
    transaction: async (work: (t: unknown) => Promise<unknown>) => {
      calls.push("transaction");
      return work(tx);
    },
  };

  return { db: handle as unknown as DrizzleDb, calls };
}

/** A handle that fails the test if it is touched at all. */
function forbiddenDb(): DrizzleDb {
  const boom = (what: string) => () => {
    throw new Error(`[test] the database was touched: ${what}()`);
  };
  return {
    select: boom("select"),
    selectDistinct: boom("selectDistinct"),
    insert: boom("insert"),
    update: boom("update"),
    delete: boom("delete"),
    transaction: boom("transaction"),
  } as unknown as DrizzleDb;
}

describe("ensureDefault", () => {
  it("does not lose a race with the same person in two tabs", () => {
    // INSERT … ON CONFLICT DO NOTHING against the partial unique index, then
    // read. A SELECT-then-INSERT would let both tabs see "no default", both
    // insert, and one get a constraint violation the person reads as "saving
    // is broken" on their very first save.
    const { sql } = buildEnsureDefaultInsert(db as never, "u1", new Date(0)).toSQL();
    expect(sql.toLowerCase()).toContain("on conflict");
    expect(sql.toLowerCase()).toContain("do nothing");
  });

  it("writes before it reads, so there is no window between the two", async () => {
    // The order is the mechanism: an insert that conflicts is a no-op, and the
    // read that follows sees whichever tab won. Reading first and deciding
    // from the answer is exactly the race above.
    const { db: handle, calls } = recordingDb([
      { id: "l1", userId: "u1", name: null, isDefault: true, createdAt: new Date(0) },
    ]);
    const repo = new DrizzleFavouriteListRepository();
    const list = await __runWithTransactionContextForTests(handle, () => repo.ensureDefault("u1", new Date(0)));

    expect(calls).toEqual(["db.insert", "db.insert.values:1", "db.select"]);
    expect(list.isDefault).toBe(true);
    expect(list.name).toBeNull();
  });
});

describe("setLists", () => {
  it("runs as one transaction", async () => {
    // Half-applied, it leaves the listing in lists nobody chose. The dialog
    // would then show one thing and the lists another, with no way to tell
    // which is right.
    const { db: handle, calls } = recordingDb();
    const repo = new DrizzleFavouriteRepository();
    await __runWithTransactionContextForTests(handle, () =>
      repo.setLists({
        userId: "u1",
        targetType: "service",
        targetId: "s1",
        listIds: ["l1", "l2"],
        now: new Date(0),
      }),
    );

    // Both writes went through the transaction handle, never the outer one:
    // a `db.delete` or `db.insert` in this list would be a statement that
    // commits on its own.
    expect(calls).toEqual(["transaction", "tx.delete", "tx.insert", "tx.insert.values:2"]);
  });

  it("adds and removes in one statement each, not one per list", async () => {
    // Somebody with twelve lists ticking three should cost two statements,
    // not fifteen.
    const { db: handle, calls } = recordingDb();
    const repo = new DrizzleFavouriteRepository();
    await __runWithTransactionContextForTests(handle, () =>
      repo.setLists({
        userId: "u1",
        targetType: "service",
        targetId: "s1",
        listIds: ["l1", "l2", "l3"],
        now: new Date(0),
      }),
    );

    expect(calls.filter((c) => c === "tx.delete")).toHaveLength(1);
    expect(calls.filter((c) => c === "tx.insert")).toHaveLength(1);
    // …and the one insert carried all three rows, rather than the loop having
    // been moved outside the counter above.
    expect(calls).toContain("tx.insert.values:3");
  });

  it("skips the insert entirely when nothing is ticked, and still clears the target", async () => {
    // `values()` with an empty array is an error in drizzle, so unticking the
    // last list has to be a delete on its own.
    const { db: handle, calls } = recordingDb();
    const repo = new DrizzleFavouriteRepository();
    await __runWithTransactionContextForTests(handle, () =>
      repo.setLists({ userId: "u1", targetType: "service", targetId: "s1", listIds: [], now: new Date(0) }),
    );

    expect(calls).toEqual(["transaction", "tx.delete"]);

    // And that lone delete still names the target rather than becoming a
    // no-op: `<> all(array[]::uuid[])` is true of every row, which is exactly
    // "remove this listing from everywhere". The `::uuid[]` is load-bearing —
    // `array[]` with no cast is a type Postgres refuses to guess.
    const { sql, params } = buildSetListsDelete(db as never, {
      userId: "u1",
      targetType: "service",
      targetId: "s1",
      listIds: [],
    }).toSQL();
    expect(clauseOf(sql, " where ")).toContain("<> all(array[]::uuid[])");
    expect(params).toEqual(["u1", "service", "s1"]);
  });

  it("touches no list belonging to somebody else", () => {
    // The command checks ownership, and this checks it again: `where user_id
    // = ?` on both statements, so a listId that slipped through is a no-op
    // rather than a write into a stranger's list.
    const removal = buildSetListsDelete(db as never, {
      userId: "u1",
      targetType: "service",
      targetId: "s1",
      listIds: ["l1"],
    }).toSQL();
    expect(clauseOf(removal.sql, " where ")).toContain("user_id");
    expect(removal.params).toContain("u1");

    // The insert's own scoping is not a WHERE — every row it writes carries
    // the caller's id in `user_id`, which the composite foreign key then
    // forces to match the list's owner. Asserting on the SQL text would be
    // vacuous (drizzle names every column in the insert's column list), so
    // this asserts the bound value, once per row.
    const addition = buildSetListsInsert(db as never, {
      userId: "u1",
      targetType: "service",
      targetId: "s1",
      listIds: ["l1", "l2"],
      now: new Date(0),
    }).toSQL();
    expect(addition.params.filter((p) => p === "u1")).toHaveLength(2);
  });

  it("does not rewrite rows that are already right", () => {
    // A DELETE-everything-then-INSERT loses the original createdAt, and the
    // list reorders itself every time the dialog is opened and closed.
    const removal = buildSetListsDelete(db as never, {
      userId: "u1",
      targetType: "service",
      targetId: "s1",
      listIds: ["l1", "l2"],
    }).toSQL();
    // The delete spares the ticked lists rather than clearing the target:
    // `<> ALL(<the ticked lists>)` is what makes it a diff and not a reset.
    expect(clauseOf(removal.sql, " where ")).toContain("<> all(array[");
    expect(removal.params).toEqual(expect.arrayContaining(["l1", "l2"]));
    // Each id bound on its own, never the whole array as one parameter.
    // `<> all($n::uuid[])` reads better and does not work: postgres-js has no
    // type for a plain JS array, so it serialises it with `'' + x` — a
    // comma-joined string with no braces — and Postgres answers `malformed
    // array literal`. Checked against the dev instance; this assertion is
    // what stops the shorter form being "tidied" back in.
    expect(removal.params).not.toContainEqual(["l1", "l2"]);

    // And the row that survived the delete is not overwritten by the insert
    // that follows, so its createdAt — the list's sort key — is untouched.
    const addition = buildSetListsInsert(db as never, {
      userId: "u1",
      targetType: "service",
      targetId: "s1",
      listIds: ["l1", "l2"],
      now: new Date(0),
    }).toSQL();
    expect(addition.sql.toLowerCase()).toContain("on conflict do nothing");
    expect(addition.sql.toLowerCase()).not.toContain("do update");
  });
});

describe("markedFor", () => {
  it("answers an empty page without touching the database", async () => {
    // `IN ()` is a syntax error, and an empty page of cards is a real case.
    const repo = new DrizzleFavouriteRepository();
    const marked = await __runWithTransactionContextForTests(forbiddenDb(), () =>
      repo.markedFor({ userId: "u1", targetType: "service", targetIds: [] }),
    );
    expect(marked).toEqual([]);
  });

  it("returns each id once even when it is in three lists", () => {
    // The heart is "saved anywhere", not "saved three times". A duplicate here
    // becomes a Set on the client and hides nothing — but the payload is three
    // times the size for no reason, so the de-duplication belongs in the
    // statement, not after it.
    const { sql, params } = buildMarkedForQuery(db as never, {
      userId: "u1",
      targetType: "service",
      targetIds: ["s1", "s2"],
    }).toSQL();
    expect(sql.toLowerCase().startsWith("select distinct")).toBe(true);
    const where = clauseOf(sql, " where ");
    expect(where).toContain("user_id");
    expect(where).toContain("target_type");
    expect(params).toEqual(expect.arrayContaining(["u1", "service", "s1", "s2"]));
  });
});

describe("the other batch reads", () => {
  it("answer an empty input without touching the database", async () => {
    // Same `IN ()` syntax error as `markedFor`, reached from three more
    // directions: a page with no cards, a person with no lists, a mosaic with
    // nothing to draw.
    const lists = new DrizzleFavouriteListRepository();
    const favourites = new DrizzleFavouriteRepository();

    await __runWithTransactionContextForTests(forbiddenDb(), async () => {
      expect(await lists.ownedBy({ userId: "u1", listIds: [] })).toEqual([]);
      expect(await favourites.countsFor([])).toEqual(new Map());
      expect(await favourites.coverTargetsFor({ listIds: [], perList: 4 })).toEqual(new Map());
    });
  });
});

describe("coverTargetsFor", () => {
  it("takes the newest few per list in one query, not one query per list", () => {
    // Twelve lists on the favourites page is twelve round trips if the
    // "top N per group" is done by looping. `row_number()` partitioned by
    // list does it in the statement.
    const { sql, params } = buildCoverTargetsQuery(db as never, { listIds: ["l1", "l2"], perList: 4 }).toSQL();
    const lower = sql.toLowerCase();
    expect(lower).toContain("row_number() over (partition by");
    // `desc`, and not merely the column: ordering by created_at ascending
    // would put the *oldest* four in the mosaic, which the column name alone
    // cannot tell apart.
    expect(lower).toContain('created_at" desc');
    expect(lower).toContain("<=");
    expect(params).toEqual(expect.arrayContaining(["l1", "l2", 4]));
  });
});

describe("entriesIn", () => {
  it("pages by cursor, not offset", () => {
    // A list is appended to at the top, which is exactly where offset breaks:
    // a row saved between two page fetches shifts every offset by one, so the
    // reader sees an entry twice or never.
    const { sql, params } = buildEntriesInQuery(db as never, {
      listId: "l1",
      limit: 20,
      after: { createdAt: new Date("2026-01-01T00:00:00.000Z"), id: "f9" },
    }).toSQL();
    const lower = sql.toLowerCase();
    expect(lower).not.toContain("offset");
    const where = clauseOf(sql, " where ");
    // The keyset itself: both halves of `(created_at, id)`, because two rows
    // can share a millisecond and time alone would skip one or repeat it.
    expect(where).toContain("created_at");
    expect(where).toContain('"id" <');
    expect(params).toContain("f9");
    // One more row than asked for — its existence is what says another page
    // exists, without a second COUNT that could disagree with this one.
    expect(params).toContain(21);
    const orderBy = clauseOf(sql, "order by");
    expect(orderBy).toContain('created_at" desc');
    expect(orderBy).toContain('"id" desc');
  });

  it("rejects a cursor that does not decode rather than restarting at page one", async () => {
    // A client looping on "cursor in, cursor out" until null would otherwise
    // loop forever on a truncated token instead of ever finding out.
    const repo = new DrizzleFavouriteRepository();
    await __runWithTransactionContextForTests(forbiddenDb(), async () => {
      // `forbiddenDb` is the second half of the assertion: it fails if the
      // repository ran the query anyway, which is what "silently restarting
      // at page one" looks like from here.
      await expect(repo.entriesIn({ listId: "l1", limit: 20, cursor: "not-a-cursor" })).rejects.toBeInstanceOf(
        CursorInvalidError,
      );
    });
  });
});
