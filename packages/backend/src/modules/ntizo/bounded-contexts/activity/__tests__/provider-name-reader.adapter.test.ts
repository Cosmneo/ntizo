/**
 * DB-backed test for `DrizzleProviderNameReader` against the real dev
 * database — same reasoning as `catalog-unpublish-sweep.test.ts`: a fake
 * reimplementing "select name from provider where id = ..." would only
 * prove the fake agrees with itself, not that the real query and the real
 * column name are right.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as authSchema from "../../../../better-auth/infrastructure/database/schema";
import { __runWithTransactionContextForTests } from "../../../../../shared/infrastructure/database/tx-context";
import { provider } from "../../../shared/infrastructure/database/provider/schemas";
import { user } from "../../../shared/infrastructure/database/user/schemas/user.schema";
import { DrizzleProviderNameReader } from "../infrastructure/outbound-adapters/cross-bc/provider-name-reader.adapter";

const url = process.env["DEV_DB_URL"];
if (!url) throw new Error("DEV_DB_URL is not set — see packages/backend/.env");

const sql = postgres(url, { max: 1 });
const db = drizzle(sql, { schema: authSchema });
const reader = new DrizzleProviderNameReader();

const suffix = crypto.randomUUID();
const ownerId = crypto.randomUUID();
let providerId: string;

afterAll(async () => {
  await db.delete(provider).where(eq(provider.id, providerId));
  await db.delete(user).where(eq(user.id, ownerId));
  await sql.end({ timeout: 5 });
});

describe("DrizzleProviderNameReader — real column, real row", () => {
  test("resolves the provider's current name", async () => {
    await db.insert(user).values({ id: ownerId, email: `activity-pnr-${suffix}@example.com` });
    const [row] = await db
      .insert(provider)
      .values({
        ownerUserId: ownerId,
        type: "individual",
        name: "Activity Reader Test Provider",
        slug: `activity-pnr-test-${suffix}`,
        status: "active",
      })
      .returning({ id: provider.id });
    providerId = row!.id;

    const name = await __runWithTransactionContextForTests(db, () =>
      reader.findNameById(providerId),
    );
    expect(name).toBe("Activity Reader Test Provider");
  });

  test("answers null for a provider that does not exist", async () => {
    const name = await __runWithTransactionContextForTests(db, () =>
      reader.findNameById(crypto.randomUUID()),
    );
    expect(name).toBeNull();
  });
});
