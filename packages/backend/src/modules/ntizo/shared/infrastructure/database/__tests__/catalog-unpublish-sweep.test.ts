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
import { eq } from "drizzle-orm";
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

let userAId: string;
let userBId: string;
let providerAId: string;
let providerBId: string;
let memberAId: string;
let memberBId: string;
let categoryId: string;

// The one row that should be swept, and the three that each survive for a
// different one of the method's three predicates.
let publishedNoMembersA: string;
let publishedNoMembersB: string;
let publishedWithMemberA: string;
let draftNoMembersA: string;

/** The sweep runs exactly once, in `beforeAll`, against real rows; every test below only reads its result. */
let sweepResult: { serviceId: string; name: string }[];

beforeAll(async () => {
  userAId = crypto.randomUUID();
  userBId = crypto.randomUUID();
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

  const [memberBRow] = await db
    .insert(providerMember)
    .values({ providerId: providerBId, userId: userBId, role: "owner" })
    .returning({ id: providerMember.id });
  memberBId = memberBRow!.id;

  const [categoryRow] = await db
    .insert(category)
    .values({ code: `catalog-sweep-test-${suffix}` })
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
});

afterAll(async () => {
  const serviceIds = [
    publishedNoMembersA,
    publishedNoMembersB,
    publishedWithMemberA,
    draftNoMembersA,
  ];
  await bestEffortCleanup([
    () => db.delete(serviceMember).where(eq(serviceMember.serviceId, publishedWithMemberA)),
    ...serviceIds.map((id) => () => db.delete(serviceTranslation).where(eq(serviceTranslation.serviceId, id))),
    ...serviceIds.map((id) => () => db.delete(service).where(eq(service.id, id))),
    () => db.delete(category).where(eq(category.id, categoryId)),
    () => db.delete(providerMember).where(eq(providerMember.id, memberAId)),
    () => db.delete(providerMember).where(eq(providerMember.id, memberBId)),
    () => db.delete(provider).where(eq(provider.id, providerAId)),
    () => db.delete(provider).where(eq(provider.id, providerBId)),
    () => db.delete(user).where(eq(user.id, userAId)),
    () => db.delete(user).where(eq(user.id, userBId)),
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
