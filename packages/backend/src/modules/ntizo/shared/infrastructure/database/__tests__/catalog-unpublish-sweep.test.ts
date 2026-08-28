/**
 * DB-backed test for `DrizzleServiceRepository.unpublishServicesWithoutMembers`
 * against the real dev database — see `scheduling-constraints.test.ts` for the
 * same reasoning: the generated SQL can look right in review while a
 * predicate quietly isn't doing its job (or stops doing its job after a later
 * edit), and only running the real query against real rows proves each
 * predicate actually holds. A hand-written fake repository re-implementing
 * the same three predicates would prove nothing about the shipped SQL — it
 * would only prove the fake agrees with itself.
 *
 * `unpublishServicesWithoutMembers` is not a CHECK constraint, so this does
 * not assert on a rejected insert the way `scheduling-constraints.test.ts`
 * does. Instead it seeds four services shaped to tell the method's three
 * `WHERE` predicates apart — one qualifies, three don't, each for a different
 * predicate's reason — calls the real repository method once, and asserts
 * each service ended up exactly where its predicate says it should.
 *
 * `DrizzleServiceRepository` reaches the database through `getDb()`, which
 * normally resolves via the app's request-scoped `infraStore` (set up by
 * request middleware this test never runs). `__runWithTransactionContextForTests`
 * binds a real Postgres-backed Drizzle client into the same AsyncLocalStorage
 * `getDb()` reads from, the same mechanism `outbox-event.repository.test.ts`
 * uses — the difference here is the bound client is a genuine connection to
 * `DEV_DB_URL`, not a fake, because the point is to exercise the real SQL.
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import * as authSchema from "../../../../../better-auth/infrastructure/database/schema";
import { __runWithTransactionContextForTests } from "../../../../../../shared/infrastructure/database/tx-context";
import { DrizzleServiceRepository } from "../../../../bounded-contexts/catalog/infrastructure/repositories/drizzle/service.repository";
import {
  bestEffortCleanup,
  DEV_DB_COLD_START_TIMEOUT_MS,
  openDevDbConnection,
} from "./dev-db-test-connection";
import { category } from "../catalog/schemas/category.schema";
import { service, serviceTranslation } from "../catalog/schemas/service.schema";
import { serviceMember } from "../catalog/schemas/service-member.schema";
import { provider } from "../provider/schemas/provider.schema";
import { providerMember } from "../provider/schemas/provider-member.schema";
import { user } from "../user/schemas/user.schema";

setDefaultTimeout(DEV_DB_COLD_START_TIMEOUT_MS);

const sql = openDevDbConnection();
// `{ schema: authSchema }` matches exactly how the app's own
// `Db.getDbConnection()` constructs its client (see `connection.ts`) — the
// `DrizzleDb` type `__runWithTransactionContextForTests` expects is that
// schema-typed shape, not a bare `drizzle(sql)`.
const db = drizzle(sql, { schema: authSchema });
const repo = new DrizzleServiceRepository();

const suffix = crypto.randomUUID();

/**
 * The keys teardown deletes by, all decided here rather than handed back by
 * `beforeAll` — see this file's `afterAll` for why that difference is the
 * whole fix.
 */
const categoryCode = `catalog-sweep-test-${suffix}`;
const providerSlugs = [`catalog-sweep-test-a-${suffix}`, `catalog-sweep-test-b-${suffix}`] as const;
const userAId = crypto.randomUUID();
const userBId = crypto.randomUUID();

let providerAId: string;
let providerBId: string;
let memberAId: string;
let categoryId: string;

// The one row that should be swept, and the three that each survive for a
// different one of the method's three predicates.
let publishedNoMembersA: string;
let publishedNoMembersB: string;
let publishedWithMemberA: string;
let draftNoMembersA: string;

/** The sweep runs exactly once, in `beforeAll`, against real rows; every test below only reads its result. */
let sweepResult: { serviceId: string; name: string }[];

/**
 * `beforeAll`'s own promise, so `afterAll` can wait for it.
 *
 * A hook that exceeds bun:test's timeout is declared failed but is not
 * stopped: its `await`s go on resolving, and `afterAll` starts alongside
 * them. Both hooks share this file's single connection (`max: 1`), so their
 * statements interleave, and teardown that begins mid-seed deletes rows the
 * seed then re-creates. That is not hypothetical here — it is legible in the
 * rows fifteen leaked runs left in the dev database: every one of them still
 * has the `service_member` row that `afterAll`'s *first* statement deletes,
 * and four of them are missing exactly the first three service translations
 * of four, the seed's fourth insert having landed after teardown had already
 * gone past it.
 */
let seeding: Promise<unknown> = Promise.resolve();

beforeAll(() => (seeding = seed()));

async function seed(): Promise<void> {
  await db.insert(user).values([
    { id: userAId, email: `catalog-sweep-a-${suffix}@example.com` },
    { id: userBId, email: `catalog-sweep-b-${suffix}@example.com` },
  ]);

  const [providerARow] = await db
    .insert(provider)
    .values({
      ownerUserId: userAId,
      type: "individual",
      name: "Catalog Sweep Test Provider A",
      slug: `catalog-sweep-test-a-${suffix}`,
      status: "active",
    })
    .returning({ id: provider.id });
  providerAId = providerARow!.id;

  const [providerBRow] = await db
    .insert(provider)
    .values({
      ownerUserId: userBId,
      type: "individual",
      name: "Catalog Sweep Test Provider B",
      slug: `catalog-sweep-test-b-${suffix}`,
      status: "active",
    })
    .returning({ id: provider.id });
  providerBId = providerBRow!.id;

  const [memberARow] = await db
    .insert(providerMember)
    .values({ providerId: providerAId, userId: userAId, role: "owner" })
    .returning({ id: providerMember.id });
  memberAId = memberARow!.id;

  // Provider B's owner, for shape: an active provider with no membership at
  // all is not a state the write path can produce. Its id is never needed —
  // the sweep's `notExists` looks at `service_member`, not at this — and
  // teardown reaches it by cascade from the provider.
  await db
    .insert(providerMember)
    .values({ providerId: providerBId, userId: userBId, role: "owner" });

  const [categoryRow] = await db
    .insert(category)
    .values({ code: categoryCode })
    .returning({ id: category.id });
  categoryId = categoryRow!.id;

  async function makeService(
    providerId: string,
    status: "draft" | "published",
    name: string,
  ): Promise<string> {
    const [row] = await db
      .insert(service)
      .values({
        providerId,
        categoryId,
        sourceLocale: "pt-MZ",
        locationType: "at_provider",
        status,
      })
      .returning({ id: service.id });
    const id = row!.id;
    await db.insert(serviceTranslation).values({ serviceId: id, locale: "pt-MZ", name });
    return id;
  }

  // 1. Published, provider A, no performers — the one row every predicate
  //    lets through, so this must be swept and returned.
  publishedNoMembersA = await makeService(providerAId, "published", "Corte (A, sem equipa)");
  // 2. Published, provider B, no performers — same shape as (1) except the
  //    provider, so this is the case only `eq(service.providerId, providerId)`
  //    stands between it and being swept by a call scoped to provider A.
  publishedNoMembersB = await makeService(providerBId, "published", "Corte (B, sem equipa)");
  // 3. Published, provider A, HAS a performer — the case only `notExists(...)`
  //    stands between it and being swept.
  publishedWithMemberA = await makeService(providerAId, "published", "Corte (A, com equipa)");
  // 4. Draft, provider A, no performers — was already not live; the case
  //    only `eq(service.status, "published")` stands between it and being
  //    swept (and, since it's already draft, between it and being wrongly
  //    reported as *changed* in the returned array).
  draftNoMembersA = await makeService(providerAId, "draft", "Corte (A, rascunho)");

  await db.insert(serviceMember).values({ serviceId: publishedWithMemberA, memberId: memberAId });

  sweepResult = await __runWithTransactionContextForTests(db, () =>
    repo.unpublishServicesWithoutMembers(providerAId),
  );
}

/**
 * Three statements, keyed on names this file chose, not on ids the seed
 * returned — and in the order the foreign keys allow.
 *
 * Deleting the two providers is what removes everything under them:
 * `service.provider_id` cascades, and `service_translation`,
 * `service_member` and `provider_member` cascade behind it. The category can
 * only go once no service references it and the users only once no provider
 * owns them — neither of those two FKs cascades — so: providers, category,
 * users.
 *
 * Sixteen statements deleting each row by its own id, which is what this was,
 * is sixteen round trips against a database on the other side of the Atlantic
 * sharing one hook budget between them; whatever the budget, a teardown that
 * runs out of it leaves every row after the cut. Three statements are also
 * three chances to be interrupted rather than sixteen, and each one deletes a
 * whole subtree rather than a single row, so being interrupted between them
 * leaves less behind.
 */
afterAll(async () => {
  // Never race a hook bun:test gave up on; see `seeding`.
  await seeding.catch(() => {});
  await bestEffortCleanup([
    () => db.delete(provider).where(inArray(provider.slug, [...providerSlugs])),
    () => db.delete(category).where(eq(category.code, categoryCode)),
    () => db.delete(user).where(inArray(user.id, [userAId, userBId])),
    () => sql.end({ timeout: 5 }),
  ]);
});

async function statusOf(serviceId: string): Promise<string | undefined> {
  const [row] = await db
    .select({ status: service.status })
    .from(service)
    .where(eq(service.id, serviceId));
  return row?.status;
}

describe("DrizzleServiceRepository.unpublishServicesWithoutMembers — real predicates, real rows", () => {
  test("sweeps a published service of this provider with no performers, and returns it named", async () => {
    expect(sweepResult).toContainEqual({
      serviceId: publishedNoMembersA,
      name: "Corte (A, sem equipa)",
    });
    expect(await statusOf(publishedNoMembersA)).toBe("draft");
  });

  test("leaves another provider's published, memberless service untouched — the providerId predicate", async () => {
    expect(sweepResult.map((r) => r.serviceId)).not.toContain(publishedNoMembersB);
    expect(await statusOf(publishedNoMembersB)).toBe("published");
  });

  test("leaves a published service that still has a performer untouched — the notExists predicate", async () => {
    expect(sweepResult.map((r) => r.serviceId)).not.toContain(publishedWithMemberA);
    expect(await statusOf(publishedWithMemberA)).toBe("published");
  });

  test("leaves an already-draft, memberless service untouched and unreturned — the status predicate", async () => {
    expect(sweepResult.map((r) => r.serviceId)).not.toContain(draftNoMembersA);
    expect(await statusOf(draftNoMembersA)).toBe("draft");
  });
});
