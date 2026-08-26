/**
 * DB-backed test for `DrizzleProviderNameReader` against the real dev
 * database — same reasoning as `catalog-unpublish-sweep.test.ts`: a fake
 * reimplementing "select name from provider where id = ..." would only
 * prove the fake agrees with itself, not that the real query and the real
 * column name are right.
 *
 * Two providers, not one. A single-row fixture cannot tell "filters by id"
 * apart from "returns whatever row it finds" — dropping the adapter's
 * `.where(...)` entirely still returns *a* name, and in a dev database that
 * already has other providers seeded, it happens to return a different
 * (wrong) one, which looks like a passing test's failure but is really a
 * fixture that got lucky. It would not get lucky in a freshly seeded,
 * near-empty database, where a WHERE-less query naturally lands on the one
 * row this test itself just inserted. Two providers here removes that
 * dependence on what else happens to be in the table: `findNameById` is
 * asserted to return each one's own name, not the other's and not "some
 * name", the same fix `service-name-reader.adapter.test.ts` applies for its
 * own coincidence (a competing `de-DE` translation on the row whose
 * `source_locale` should win).
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
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
const ownerAId = crypto.randomUUID();
const ownerBId = crypto.randomUUID();
let providerAId: string;
let providerBId: string;

beforeAll(async () => {
  await db.insert(user).values([
    { id: ownerAId, email: `activity-pnr-a-${suffix}@example.com` },
    { id: ownerBId, email: `activity-pnr-b-${suffix}@example.com` },
  ]);

  const [rowA] = await db
    .insert(provider)
    .values({
      ownerUserId: ownerAId,
      type: "individual",
      name: "Activity Reader Test Provider A",
      slug: `activity-pnr-test-a-${suffix}`,
      status: "active",
    })
    .returning({ id: provider.id });
  providerAId = rowA!.id;

  const [rowB] = await db
    .insert(provider)
    .values({
      ownerUserId: ownerBId,
      type: "individual",
      name: "Activity Reader Test Provider B",
      slug: `activity-pnr-test-b-${suffix}`,
      status: "active",
    })
    .returning({ id: provider.id });
  providerBId = rowB!.id;
});

afterAll(async () => {
  await db.delete(provider).where(eq(provider.id, providerAId));
  await db.delete(provider).where(eq(provider.id, providerBId));
  await db.delete(user).where(eq(user.id, ownerAId));
  await db.delete(user).where(eq(user.id, ownerBId));
  await sql.end({ timeout: 5 });
});

describe("DrizzleProviderNameReader — real column, real row, real WHERE", () => {
  test("resolves this provider's name, not the other one's", async () => {
    const name = await __runWithTransactionContextForTests(db, () =>
      reader.findNameById(providerAId),
    );
    expect(name).toBe("Activity Reader Test Provider A");
  });

  test("resolves the other provider's name, proving the first result wasn't just whatever row exists", async () => {
    const name = await __runWithTransactionContextForTests(db, () =>
      reader.findNameById(providerBId),
    );
    expect(name).toBe("Activity Reader Test Provider B");
  });

  test("answers null for a provider that does not exist", async () => {
    const name = await __runWithTransactionContextForTests(db, () =>
      reader.findNameById(crypto.randomUUID()),
    );
    expect(name).toBeNull();
  });
});
