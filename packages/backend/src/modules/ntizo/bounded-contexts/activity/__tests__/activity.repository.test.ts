import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as authSchema from "../../../../better-auth/infrastructure/database/schema";
import { __runWithTransactionContextForTests } from "../../../../../shared/infrastructure/database/tx-context";
import { activity } from "../../../shared/infrastructure/database/activity/schemas";
import { Activity } from "../domain/aggregates/activity.aggregate";
import { CursorInvalidError } from "../domain/exceptions";
import { DrizzleActivityRepository } from "../infrastructure/repositories/drizzle/activity.repository";

const url = process.env["DEV_DB_URL"];
if (!url) throw new Error("DEV_DB_URL is not set — see packages/backend/.env");

// A live, serverless (Neon) instance, not a local one — see
// notification.repository.test.ts for why the default 5000ms is raised here.
setDefaultTimeout(20_000);

const sql = postgres(url, { max: 1 });
// `{ schema: authSchema }`, not a bare `drizzle(sql)`: `DrizzleDb` (what
// `__runWithTransactionContextForTests` binds into AsyncLocalStorage) is
// typed against this schema shape. Same requirement as every other
// real-DB repository test in this codebase.
const db = drizzle(sql, { schema: authSchema });
const repo = new DrizzleActivityRepository();

// `activity.actor_user_id` carries no foreign key to `user` — the column
// comment on the schema says why: an activity row keys the actor and never
// resolves it through a join. So, unlike the notification tests, nothing here
// needs a real `user` row to satisfy a constraint; a random id is a valid
// actor as far as this table is concerned.
const actorIds: string[] = [];
function newActor(): string {
  const id = crypto.randomUUID();
  actorIds.push(id);
  return id;
}

afterAll(async () => {
  // Every write below is real: `__runWithTransactionContextForTests` only
  // binds AsyncLocalStorage, it does not open a transaction and it does not
  // roll anything back. This is a shared dev database — clean up what this
  // file inserted.
  await db.delete(activity).where(inArray(activity.actorUserId, actorIds));
  await sql.end();
}, 20_000);

/**
 * `DrizzleActivityRepository` reaches the database through `getDb()`, which
 * resolves via the app's request-scoped context that `configMiddleware`
 * binds — and a test has no request. `__runWithTransactionContextForTests`
 * binds this test's own real, `DEV_DB_URL`-backed Drizzle client into the same
 * AsyncLocalStorage `getDb()` reads from, for the duration of one test body.
 * Same mechanism as `notification.repository.test.ts` and
 * `notification-delivery.repository.test.ts`.
 */
describe("save, then read back", () => {
  test("round-trips through rehydrate without leaking extra columns", async () => {
    const actor = newActor();
    await __runWithTransactionContextForTests(db, async () => {
      await repo.save(
        Activity.record({
          actorUserId: actor,
          type: "user.registered",
          payload: { welcomeName: "Ana" },
          occurredAt: new Date("2026-08-20T09:00:00.000Z"),
        }),
      );

      const page = await repo.listForActor({ actorUserId: actor, limit: 10 });
      expect(page.items).toHaveLength(1);
      const item = page.items[0]!;
      expect(item.actorUserId).toBe(actor);
      expect(item.type).toBe("user.registered");
      expect(item.payload).toEqual({ welcomeName: "Ana" });
      expect(item.occurredAt.toISOString()).toBe("2026-08-20T09:00:00.000Z");
      expect(typeof item.id).toBe("string");
    });
  });

  test("does not leak another actor's rows", async () => {
    const mine = newActor();
    const someoneElse = newActor();
    await __runWithTransactionContextForTests(db, async () => {
      await repo.save(
        Activity.record({
          actorUserId: someoneElse,
          type: "user.registered",
          payload: {},
          occurredAt: new Date(),
        }),
      );
      const page = await repo.listForActor({ actorUserId: mine, limit: 10 });
      expect(page.items).toHaveLength(0);
      expect(page.nextCursor).toBeNull();
    });
  });

  test("a row whose type has since fallen out of ACTIVITY_TYPES still renders, instead of failing the whole page", async () => {
    // `Activity.record` would throw on this row — that's the whole point of
    // the split. Inserted with the raw postgres client, bypassing `save` and
    // the aggregate entirely, to stand in for a row written back when
    // "service.renamed" was still a valid type and left behind after it was
    // dropped from the list. `listForActor` must rehydrate it, not validate
    // it: one stale row must not 500 an entire page of somebody's history.
    const actor = newActor();
    const staleId = crypto.randomUUID();
    await sql`
      INSERT INTO ntizo_activity.activity (id, actor_user_id, type, payload, occurred_at)
      VALUES (${staleId}, ${actor}, 'service.renamed', ${JSON.stringify({ old: true })}::jsonb, now())
    `;

    await __runWithTransactionContextForTests(db, async () => {
      const page = await repo.listForActor({ actorUserId: actor, limit: 10 });
      expect(page.items).toHaveLength(1);
      expect(page.items[0]!.id).toBe(staleId);
      // `.type` is typed as `ActivityType`, which by definition no longer
      // includes this value — that's the whole scenario. Widened to `string`
      // so the assertion can even be written; a compiler that only accepted
      // members of `ActivityType` here would be proving the wrong thing.
      expect(page.items[0]!.type as string).toBe("service.renamed");
    });
  });
});

describe("an invalid cursor", () => {
  test("is rejected with a typed, client-facing error — not a generic 500", async () => {
    // A malformed or tampered cursor decodes to null. Falling back to "no
    // cursor" here would hand back the newest page under a fresh
    // `nextCursor` — indistinguishable from a normal first call — so a
    // client paginating by following `nextCursor` until it sees null could
    // loop forever on a corrupted token instead of ever finding out.
    //
    // `CursorInvalidError` specifically, not just any thrown error: a plain
    // `Error` here is exactly what `getGraphQLErrorCode` cannot recognise —
    // it would mask to INTERNAL_ERROR and a bad cursor would read to a
    // client identically to a genuine crash.
    const actor = newActor();
    await __runWithTransactionContextForTests(db, async () => {
      await expect(
        repo.listForActor({ actorUserId: actor, limit: 10, cursor: "not-a-real-cursor" }),
      ).rejects.toThrow(CursorInvalidError);
    });
  });
});

describe("keyset pagination", () => {
  test("a page smaller than the limit returns nextCursor: null", async () => {
    const actor = newActor();
    const base = Date.parse("2026-08-01T00:00:00.000Z");
    await __runWithTransactionContextForTests(db, async () => {
      for (let n = 0; n < 3; n++) {
        await repo.save(
          Activity.record({
            actorUserId: actor,
            type: "service.published",
            payload: { n },
            occurredAt: new Date(base + n * 1000),
          }),
        );
      }

      const page = await repo.listForActor({ actorUserId: actor, limit: 5 });
      expect(page.items).toHaveLength(3);
      expect(page.nextCursor).toBeNull();
    });
  });

  test("a full page returns a cursor, and following it yields the rest — nothing skipped or repeated", async () => {
    const actor = newActor();
    const base = Date.parse("2026-08-02T00:00:00.000Z");
    await __runWithTransactionContextForTests(db, async () => {
      const inserted: string[] = [];
      for (let n = 1; n <= 3; n++) {
        const id = await repo.save(
          Activity.record({
            actorUserId: actor,
            type: "service.published",
            payload: { n },
            occurredAt: new Date(base + n * 1000),
          }),
        );
        inserted.push(id);
      }

      const page1 = await repo.listForActor({ actorUserId: actor, limit: 2 });
      expect(page1.items).toHaveLength(2);
      expect(page1.nextCursor).not.toBeNull();
      // Newest first: n=3 was written last and has the latest occurredAt.
      expect((page1.items[0]!.payload as { n: number }).n).toBe(3);
      expect((page1.items[1]!.payload as { n: number }).n).toBe(2);

      const page2 = await repo.listForActor({
        actorUserId: actor,
        limit: 2,
        cursor: page1.nextCursor,
      });
      expect(page2.items).toHaveLength(1);
      expect(page2.nextCursor).toBeNull();
      expect((page2.items[0]!.payload as { n: number }).n).toBe(1);

      // The two pages together are exactly the three rows written, once each.
      const seenIds = [...page1.items, ...page2.items].map((i) => i.id);
      expect(new Set(seenIds).size).toBe(3);
      expect(new Set(seenIds)).toEqual(new Set(inserted));
    });
  });

  test("two rows sharing an identical occurred_at are neither skipped nor repeated across the page boundary", async () => {
    const actor = newActor();
    // Same instant for both — the case the id half of the cursor exists for.
    // A cursor on time alone would use `occurredAt < after.occurredAt`, which
    // excludes a tied row entirely rather than including it, and the second
    // page would come back short by one instead of holding it.
    const tiedAt = new Date("2026-08-03T12:00:00.000Z");
    await __runWithTransactionContextForTests(db, async () => {
      await repo.save(
        Activity.record({
          actorUserId: actor,
          type: "service.published",
          payload: { tag: "x" },
          occurredAt: tiedAt,
        }),
      );
      await repo.save(
        Activity.record({
          actorUserId: actor,
          type: "service.unpublished",
          payload: { tag: "y" },
          occurredAt: tiedAt,
        }),
      );

      const page1 = await repo.listForActor({ actorUserId: actor, limit: 1 });
      expect(page1.items).toHaveLength(1);
      expect(page1.nextCursor).not.toBeNull();

      const page2 = await repo.listForActor({
        actorUserId: actor,
        limit: 1,
        cursor: page1.nextCursor,
      });
      // The defect this test exists to catch: a time-only cursor would return
      // zero items here, not one — the tied row would vanish rather than
      // appear on the next page.
      expect(page2.items).toHaveLength(1);
      expect(page2.nextCursor).toBeNull();

      const tags = [page1.items[0]!, page2.items[0]!].map(
        (i) => (i.payload as { tag: string }).tag,
      );
      // Neither skipped nor repeated: both tags appear, each exactly once.
      expect(tags.sort()).toEqual(["x", "y"]);
    });
  });
});
