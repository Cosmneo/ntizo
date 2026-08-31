/**
 * `GetProviderDetailProjection`, wired to the real `DrizzleProviderReadRepository`,
 * against the real dev database — same mechanism as
 * `read/booking/__tests__/list-my-bookings.projection.test.ts`: the repository
 * reaches the database through `getDb()`, which resolves through the app's
 * request-scoped AsyncLocalStorage context, and a test has no request.
 * `__runWithTransactionContextForTests` binds this file's own real,
 * `DEV_DB_URL`-backed Drizzle client into that same context for the duration of
 * one test body.
 *
 * `commissionBps` is the first commercially sensitive field on
 * `providerDetailReadModel` — a number that tells a provider what the platform
 * takes out of every payout. `isMember` already guards `provider.byId` end to
 * end (see `queries.handlers.test.ts`'s "authorization gate" suite, which
 * proves the ordering with a fake repository). This file is not proving a new
 * mechanism; it proves that the existing one still holds now that the model
 * carries something worth stealing. The fixture below seeds a SECOND provider
 * with a DIFFERENT commission rate on purpose — a fixture holding only the
 * caller's own workspace could not fail even if `isMember`'s `WHERE` clause
 * were ever dropped.
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import * as authSchema from "../../../../better-auth/infrastructure/database/schema";
import { __runWithTransactionContextForTests } from "../../../../../shared/infrastructure/database/tx-context";
import { provider, providerMember } from "../../../shared/infrastructure/database/provider/schemas";
import { user } from "../../../shared/infrastructure/database/user/schemas";
import { DrizzleProviderReadRepository } from "../infra/repositories/drizzle/provider-read.repository";
import { GetProviderDetailProjection } from "../app/use-cases/get-provider-detail.projection";
import {
  bestEffortCleanup,
  DEV_DB_COLD_START_TIMEOUT_MS,
  openDevDbConnection,
} from "../../../shared/infrastructure/database/__tests__/dev-db-test-connection";

setDefaultTimeout(DEV_DB_COLD_START_TIMEOUT_MS);

const sql = openDevDbConnection();
const db = drizzle(sql, { schema: authSchema });

const readRepo = new DrizzleProviderReadRepository();
const projection = new GetProviderDetailProjection(readRepo);
const suffix = crypto.randomUUID();

// Two distinct rates, neither the schema's own default (1000), so a test that
// passed by accident — e.g. by reading the column default instead of the row
// — would be visible as a false pass.
const OWN_COMMISSION_BPS = 1200;
const OTHER_COMMISSION_BPS = 700;

let ownerAId: string;
let ownerBId: string;
let providerAId: string;
let providerBId: string;

beforeAll(async () => {
  ownerAId = crypto.randomUUID();
  ownerBId = crypto.randomUUID();
  await db.insert(user).values([
    {
      id: ownerAId,
      email: `get-provider-detail-owner-a-${suffix}@ntizo.test`,
      role: "customer",
      status: "active",
    },
    {
      id: ownerBId,
      email: `get-provider-detail-owner-b-${suffix}@ntizo.test`,
      role: "customer",
      status: "active",
    },
  ]);

  const [providerARow] = await db
    .insert(provider)
    .values({
      ownerUserId: ownerAId,
      type: "individual",
      name: "Get Provider Detail Test Provider A",
      slug: `get-provider-detail-test-a-${suffix}`,
      status: "active",
      commissionBps: OWN_COMMISSION_BPS,
    })
    .returning({ id: provider.id });
  providerAId = providerARow!.id;

  const [providerBRow] = await db
    .insert(provider)
    .values({
      ownerUserId: ownerBId,
      type: "individual",
      name: "Get Provider Detail Test Provider B",
      slug: `get-provider-detail-test-b-${suffix}`,
      status: "active",
      commissionBps: OTHER_COMMISSION_BPS,
    })
    .returning({ id: provider.id });
  providerBId = providerBRow!.id;

  await db.insert(providerMember).values({
    providerId: providerAId,
    userId: ownerAId,
    role: "owner",
  });

  // Owner B is deliberately NOT made a member of provider A — the fixture
  // needs someone who exists but has no business reading provider A's rate.
  await db.insert(providerMember).values({
    providerId: providerBId,
    userId: ownerBId,
    role: "owner",
  });
});

afterAll(async () => {
  await bestEffortCleanup([
    () => db.delete(providerMember).where(eq(providerMember.providerId, providerAId)),
    () => db.delete(providerMember).where(eq(providerMember.providerId, providerBId)),
    () => db.delete(provider).where(eq(provider.id, providerAId)),
    () => db.delete(provider).where(eq(provider.id, providerBId)),
    () => db.delete(user).where(eq(user.id, ownerAId)),
    () => db.delete(user).where(eq(user.id, ownerBId)),
    () => sql.end({ timeout: 5 }),
  ]);
}, DEV_DB_COLD_START_TIMEOUT_MS);

describe("GetProviderDetailProjection, backed by DrizzleProviderReadRepository", () => {
  test("returns the signed-in provider's own commissionBps, as raw basis points", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const result = await projection.execute({
        providerId: providerAId,
        requestedByUserId: ownerAId,
      });

      // Raw basis points, not a formatted percentage: formatting is the
      // view's job (Task 2), and a number that arrives pre-formatted cannot
      // be localised.
      expect(result.commissionBps).toBe(OWN_COMMISSION_BPS);
      expect(typeof result.commissionBps).toBe("number");
      // Proves this came from provider A's own row, not a hardcoded 10% or a
      // value that happens to line up with the column default.
      expect(result.commissionBps).not.toBe(OTHER_COMMISSION_BPS);
      expect(result.commissionBps).not.toBe(1000);
    });
  });

  test("refuses a non-member's request for a different provider's commission rate", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      // Owner A is a member of provider A, not provider B — asking for B's
      // detail with A's identity is exactly the cross-tenant read this field
      // must never allow.
      await expect(
        projection.execute({ providerId: providerBId, requestedByUserId: ownerAId }),
      ).rejects.toThrow("[read/provider] not a member of this provider");
    });
  });

  test("a member of provider B sees provider B's own rate, not provider A's", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const result = await projection.execute({
        providerId: providerBId,
        requestedByUserId: ownerBId,
      });

      expect(result.commissionBps).toBe(OTHER_COMMISSION_BPS);
      expect(result.commissionBps).not.toBe(OWN_COMMISSION_BPS);
    });
  });
});
