import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { DEV_DB_COLD_START_TIMEOUT_MS, openDevDbConnection } from "./dev-db-test-connection";

/**
 * DB-backed, like its siblings (`notification-constraints`,
 * `scheduling-constraints`, `notification-delivery-constraints`), rather
 * than asserting Drizzle object properties against themselves, as this file
 * used to. `scheduling-constraints.test.ts`'s own docblock states why that
 * is not enough: "the schema file can say whatever it likes while the live
 * table quietly lacks the constraint... only inserting the row Postgres must
 * refuse actually proves the constraint is on the table." As written before
 * this, this file would still pass with migration `0021_dear_penance.sql`
 * never applied and `idx_activity_actor_occurred` absent — it never touched
 * the real database at all.
 *
 * **The dev database is shared with the user's running application, and
 * `ntizo_activity.activity` holds zero rows — verified, and this file must
 * leave it that way.** Unlike its siblings, `actor_user_id` carries no FK
 * (an activity row has to outlive the account that made it — see the Task
 * 11 e2e teardown docblock), so no fixture row is needed to prove any
 * constraint here: every `NOT NULL` below is provable with a raw `INSERT`
 * Postgres must refuse, and a refused insert commits nothing — there is
 * nothing for an `afterAll` to clean up. `created_at` is the one `NOT NULL`
 * column with a `DEFAULT`, so proving it the same way would require a
 * *successful* insert into the shared database; it is checked by catalog
 * metadata instead, for the same reason the index and the "no read state"
 * columns are — absence is not something a rejected insert can prove.
 */
setDefaultTimeout(DEV_DB_COLD_START_TIMEOUT_MS);

const sql = openDevDbConnection();

afterAll(async () => {
  await sql.end({ timeout: 5 });
});

// The `postgres` package's tagged-template result is a lazy thenable (a
// `Query`, not a native `Promise`) — the same reason
// `scheduling-constraints.test.ts` wraps Drizzle's query builders before
// handing them to `expect(...).rejects`: without this, `bun:test`'s
// `.rejects` matcher never observes the rejection and the test hangs at
// 100% CPU rather than failing or passing — confirmed by hand against this
// exact package version before writing the tests below this way.
async function insertMissingActor() {
  return await sql`insert into ntizo_activity.activity (type, payload, occurred_at)
      values ('test.constraint-probe', '{}'::jsonb, now())`;
}
async function insertMissingType() {
  return await sql`insert into ntizo_activity.activity (actor_user_id, payload, occurred_at)
      values ('constraint-probe', '{}'::jsonb, now())`;
}
async function insertMissingPayload() {
  return await sql`insert into ntizo_activity.activity (actor_user_id, type, occurred_at)
      values ('constraint-probe', 'test.constraint-probe', now())`;
}
async function insertMissingOccurredAt() {
  return await sql`insert into ntizo_activity.activity (actor_user_id, type, payload)
      values ('constraint-probe', 'test.constraint-probe', '{}'::jsonb)`;
}

describe("the activity table", () => {
  test("keys rows by the actor, not by what was acted on", async () => {
    // The whole distinction from the inbox. A row keyed by the thing would
    // make "what did I do" unanswerable without a join that does not exist.
    // `type`, `payload` and `occurred_at` are supplied and valid; only
    // `actor_user_id` is missing, so this is the one constraint that can
    // fail.
    await expect(insertMissingActor()).rejects.toThrow(/actor_user_id/);
  });

  test("refuses a row with no type", async () => {
    await expect(insertMissingType()).rejects.toThrow(/null value in column "type"/);
  });

  test("refuses a row with no payload", async () => {
    await expect(insertMissingPayload()).rejects.toThrow(/null value in column "payload"/);
  });

  test("records when the event happened, separately from when it was written", async () => {
    // `occurred_at` has no DEFAULT, so a row that omits it is refused —
    // proof by rejected insert, like the constraints above. `created_at`
    // does have a DEFAULT (`now()`), so proving it the same way would mean
    // a row actually landing in the shared table; that half is checked by
    // catalog metadata in the next test instead.
    await expect(insertMissingOccurredAt()).rejects.toThrow(/null value in column "occurred_at"/);
  });

  test("writes `created_at` on insert, on its own, separately from `occurred_at`", async () => {
    const columns = await sql`
      select column_name, is_nullable, column_default
      from information_schema.columns
      where table_schema = 'ntizo_activity'
        and table_name = 'activity'
        and column_name = 'created_at'
    `;
    expect(columns).toHaveLength(1);
    expect(columns[0]?.is_nullable).toBe("NO");
    expect(columns[0]?.column_default).toContain("now()");
  });

  test("has no read state, because activity is not read", async () => {
    // If this table ever gains a `read_at` or `is_read`, it has drifted
    // into being a second inbox and the two will disagree about what a
    // notification is. Checked against the live table's own columns, not
    // against the Drizzle schema object that is supposed to describe it.
    const columns = await sql`
      select column_name
      from information_schema.columns
      where table_schema = 'ntizo_activity' and table_name = 'activity'
    `;
    const names = columns.map((c) => c.column_name as string);
    expect(names).not.toContain("read_at");
    expect(names).not.toContain("is_read");
  });

  test("carries the index a person's own history is paged through", async () => {
    // The concrete failure this file used to be unable to catch: migration
    // 0021 never applied, or the index dropped by hand. `listForActor`
    // pages on (actor_user_id, occurred_at desc, id desc) — without this
    // index that query still returns the right rows, just via a sequential
    // scan that gets slower as the table grows, which no unit test would
    // ever notice.
    const indexes = await sql`
      select indexname
      from pg_indexes
      where schemaname = 'ntizo_activity'
        and tablename = 'activity'
        and indexname = 'idx_activity_actor_occurred'
    `;
    expect(indexes).toHaveLength(1);
  });
});
