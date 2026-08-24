import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { notification } from "../notification/schemas/notification.schema";
import type { NewNotificationRecord } from "../notification/schemas/notification.schema";
import { notificationRead } from "../notification/schemas/notification-read.schema";
import { user } from "../user/schemas/user.schema";
import { provider } from "../provider/schemas/provider.schema";
import { providerMember } from "../provider/schemas/provider-member.schema";

const url = process.env["DEV_DB_URL"];
if (!url) {
  throw new Error(
    "DEV_DB_URL is not set. These tests assert against the real dev database " +
      "— set it (see packages/backend/.env) and try again.",
  );
}

const sql = postgres(url, { max: 1 });
const db = drizzle(sql);

const suffix = crypto.randomUUID();
let userId: string;
// Only `notification_one_addressee` needs a real provider row — a row that
// carries both a `user_id` and a `provider_id` at once, which is the only
// shape that violates that constraint without also violating
// `notification_audience_matches_addressee` (see the test below). Built the
// same way scheduling-constraints.test.ts builds its provider fixture.
let providerId: string;
let memberId: string;

beforeAll(async () => {
  userId = crypto.randomUUID();
  await db.insert(user).values({
    id: userId,
    email: `notif-${suffix}@ntizo.test`,
    role: "customer",
    status: "active",
  });

  const [providerRow] = await db
    .insert(provider)
    .values({
      ownerUserId: userId,
      type: "individual",
      name: "Notification Constraint Test Provider",
      slug: `notification-constraint-test-${suffix}`,
      status: "active",
    })
    .returning({ id: provider.id });
  providerId = providerRow!.id;

  const [memberRow] = await db
    .insert(providerMember)
    .values({ providerId, userId, role: "owner" })
    .returning({ id: providerMember.id });
  memberId = memberRow!.id;
});

afterAll(async () => {
  // Children first, same ordering discipline as scheduling-constraints.test.ts.
  await db.delete(providerMember).where(eq(providerMember.id, memberId));
  await db.delete(provider).where(eq(provider.id, providerId));
  await db.delete(user).where(eq(user.id, userId));
  await sql.end();
});

// Drizzle's query builders are lazy thenables, not native `Promise`s — they
// only run once `.then`/`await` touches them. `expect(...).rejects` needs a
// real `Promise`, which wrapping in an `async` function guarantees: awaiting
// a thenable inside one always produces a genuine `Promise` on the outside.
// Same technique as scheduling-constraints.test.ts's `insertWeekly` etc.
async function insertNotification(values: NewNotificationRecord) {
  return await db.insert(notification).values(values).returning();
}

describe("notification addressing", () => {
  test("accepts a row addressed to a user", async () => {
    const [row] = await insertNotification({
      type: "WELCOME",
      audience: "user",
      userId,
      payload: {},
    });
    expect(row?.id).toBeString();
    await db.delete(notification).where(eq(notification.id, row!.id));
  });

  // A row with `audience: "user"` and neither id set violates
  // `notification_one_addressee` (zero non-null ids, needs exactly one) AND
  // `notification_audience_matches_addressee` (audience says "user" but
  // `user_id` is null) at once — `audience` is `NOT NULL` and constrained to
  // 'user'/'provider', so a zero-id row can never violate one of these
  // without also violating the other. Postgres reports
  // `notification_audience_matches_addressee` for this exact shape
  // (confirmed against the real dev database, not assumed). The test below,
  // "refuses a row addressed to two people at once", is the one that
  // isolates `notification_one_addressee` — proving it fires on its own
  // rather than merely riding along on this one's failure.
  test("refuses a row addressed to nobody", async () => {
    await expect(
      insertNotification({ type: "WELCOME", audience: "user", payload: {} }),
    ).rejects.toThrow(/notification_audience_matches_addressee/);
  });

  // The only row shape that violates `notification_one_addressee` without
  // also violating `notification_audience_matches_addressee`: audience
  // agrees with one of the two ids (here, "user" agrees with `user_id`
  // being set), but a second id is set too, so `num_nonnulls(...) = 1` is
  // the sole failure.
  test("refuses a row addressed to two people at once", async () => {
    await expect(
      insertNotification({ type: "WELCOME", audience: "user", userId, providerId, payload: {} }),
    ).rejects.toThrow(/notification_one_addressee/);
  });

  test("refuses an audience that disagrees with the id it carries", async () => {
    await expect(
      insertNotification({ type: "WELCOME", audience: "provider", userId, payload: {} }),
    ).rejects.toThrow(/notification_audience_matches_addressee/);
  });

  test("refuses an unknown audience", async () => {
    await expect(
      insertNotification({ type: "WELCOME", audience: "team", userId, payload: {} }),
    ).rejects.toThrow(/notification_audience_known/);
  });
});

describe("read state", () => {
  test("the same reader marking twice collapses to one row", async () => {
    const [row] = await db
      .insert(notification)
      .values({ type: "WELCOME", audience: "user", userId, payload: {} })
      .returning();

    await db.insert(notificationRead).values({ notificationId: row!.id, userId });
    await db
      .insert(notificationRead)
      .values({ notificationId: row!.id, userId })
      .onConflictDoNothing();

    const rows = await db
      .select()
      .from(notificationRead)
      .where(eq(notificationRead.notificationId, row!.id));
    expect(rows).toHaveLength(1);

    await db.delete(notification).where(eq(notification.id, row!.id));
  });
});
