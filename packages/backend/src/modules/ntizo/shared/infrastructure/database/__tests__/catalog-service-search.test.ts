/**
 * DB-backed test for the text search in `DrizzleServiceReadRepository.listPublished`
 * — the same reasoning as `catalog-unpublish-sweep.test.ts`: the generated SQL
 * can look right in review while the predicate quietly matches everything or
 * nothing, and only running the real query against real rows proves otherwise.
 *
 * This predicate deserves it more than most. The name a customer searches by
 * lives in `service_translation`, a one-to-many the paging query deliberately
 * does NOT join — joining it would multiply the very rows `limit`/`offset`
 * page. So the search is an `EXISTS` subquery, and an `EXISTS` correlated on
 * the wrong column matches every row instead of the right ones. A fake
 * repository re-implementing the match in JavaScript would prove only that the
 * fake agrees with itself.
 *
 * The rows are shaped so each one fails for a different reason if the
 * predicate is wrong: one matches by its own name, one only by its
 * description, one only by its provider's name, one only in a locale the
 * reader is not reading, and one carries a literal `%` that a naive `ILIKE`
 * would read as "match everything".
 *
 * Assertions intersect with the seeded ids rather than reading the whole
 * result: this runs against the shared dev database, which has other services
 * in it, and a test that asserted on totals would break whenever somebody
 * published something.
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import * as authSchema from "../../../../../better-auth/infrastructure/database/schema";
import { __runWithTransactionContextForTests } from "../../../../../../shared/infrastructure/database/tx-context";
import { DrizzleServiceReadRepository } from "../../../../bounded-contexts/catalog/infrastructure/repositories/drizzle/service-read.repository";
import {
  bestEffortCleanup,
  DEV_DB_COLD_START_TIMEOUT_MS,
  openDevDbConnection,
} from "./dev-db-test-connection";
import { category } from "../catalog/schemas/category.schema";
import { service, serviceTranslation } from "../catalog/schemas/service.schema";
import { provider } from "../provider/schemas/provider.schema";
import { user } from "../user/schemas/user.schema";

setDefaultTimeout(DEV_DB_COLD_START_TIMEOUT_MS);

const sql = openDevDbConnection();
const db = drizzle(sql, { schema: authSchema });
const repo = new DrizzleServiceReadRepository();

const suffix = crypto.randomUUID();

let userAId: string;
let userBId: string;
let providerAId: string;
let providerBId: string;
let categoryId: string;

/** Matches "corte" by its own name. */
let byName: string;
/** Matches "corte" only in its description — its name is about something else. */
let byDescription: string;
/** Written only in English: matches "haircut", and must NOT match "corte". */
let englishOnly: string;
/** Carries a literal `%`, the character an unescaped `ILIKE` reads as "anything". */
let withPercent: string;
/** Matches "corte" only through its provider's name. */
let byProviderName: string;

/**
 * Every service this test seeded, for intersecting against a shared database.
 * Starts empty rather than `undefined` so `afterAll` can iterate it safely
 * even when `beforeAll` throws before ever assigning it.
 */
let seeded: Set<string> = new Set();

beforeAll(async () => {
  userAId = crypto.randomUUID();
  userBId = crypto.randomUUID();
  await db.insert(user).values([
    { id: userAId, email: `svc-search-a-${suffix}@example.com` },
    { id: userBId, email: `svc-search-b-${suffix}@example.com` },
  ]);

  const [providerARow] = await db
    .insert(provider)
    .values({
      ownerUserId: userAId,
      type: "individual",
      // Deliberately contains none of the searched words, so a service under
      // it that matches can only have matched on its own text.
      name: "Estudio Silva",
      slug: `svc-search-a-${suffix}`,
      status: "active",
    })
    .returning({ id: provider.id });
  providerAId = providerARow!.id;

  const [providerBRow] = await db
    .insert(provider)
    .values({
      ownerUserId: userBId,
      type: "individual",
      // The only place "Corte" appears for this provider's service.
      name: "Corte & Cia",
      slug: `svc-search-b-${suffix}`,
      status: "active",
    })
    .returning({ id: provider.id });
  providerBId = providerBRow!.id;

  const [categoryRow] = await db
    .insert(category)
    .values({ code: `svc-search-test-${suffix}` })
    .returning({ id: category.id });
  categoryId = categoryRow!.id;

  async function makeService(
    providerId: string,
    locale: string,
    name: string,
    description: string | null,
  ): Promise<string> {
    const [row] = await db
      .insert(service)
      .values({
        providerId,
        categoryId,
        sourceLocale: locale,
        locationType: "at_provider",
        status: "published",
      })
      .returning({ id: service.id });
    const id = row!.id;
    await db.insert(serviceTranslation).values({ serviceId: id, locale, name, description });
    return id;
  }

  byName = await makeService(providerAId, "pt-MZ", "Corte de cabelo masculino", null);
  byDescription = await makeService(providerAId, "pt-MZ", "Manicure", "Inclui corte de unhas");
  englishOnly = await makeService(providerAId, "en-US", "Haircut", null);
  withPercent = await makeService(providerAId, "pt-MZ", "Massagem 100% relaxante", null);
  byProviderName = await makeService(providerBId, "pt-MZ", "Massagem de pedras", null);

  seeded = new Set([byName, byDescription, englishOnly, withPercent, byProviderName]);
});

afterAll(async () => {
  await bestEffortCleanup([
    ...Array.from(seeded, (id) => () => db.delete(serviceTranslation).where(eq(serviceTranslation.serviceId, id))),
    ...Array.from(seeded, (id) => () => db.delete(service).where(eq(service.id, id))),
    () => db.delete(category).where(eq(category.id, categoryId)),
    () => db.delete(provider).where(eq(provider.id, providerAId)),
    () => db.delete(provider).where(eq(provider.id, providerBId)),
    () => db.delete(user).where(eq(user.id, userAId)),
    () => db.delete(user).where(eq(user.id, userBId)),
    () => sql.end({ timeout: 5 }),
  ]);
});

/** The seeded services a search returns, as a set — everything else in the dev database is ignored. */
async function search(q: string | undefined): Promise<Set<string>> {
  const rows = await __runWithTransactionContextForTests(db, () =>
    repo.listPublished({ q, limit: 48, offset: 0 }),
  );
  return new Set(rows.map((r) => r.id).filter((id) => seeded.has(id)));
}

describe("listPublished text search", () => {
  test("matches a service by its own name", async () => {
    expect(await search("corte")).toContain(byName);
  });

  test("matches a service by its description, not only its name", async () => {
    // "Manicure" does not contain the word; only its description does.
    expect(await search("corte")).toContain(byDescription);
  });

  test("matches a service through its provider's name", async () => {
    // "Massagem de pedras" contains nothing of the word — the provider is
    // "Corte & Cia", which the card shows, so the match is visible to whoever
    // searched.
    expect(await search("corte")).toContain(byProviderName);
  });

  test("leaves out a service that matches nowhere", async () => {
    // Written only in English. Proves the predicate is a filter and not a
    // no-op: an `EXISTS` correlated on the wrong column returns every row,
    // and every other assertion here would still pass.
    expect(await search("corte")).not.toContain(englishOnly);
  });

  test("ignores case", async () => {
    expect(await search("CORTE")).toEqual(await search("corte"));
  });

  test("searches every translation, not only the platform's language", async () => {
    // Somebody browsing in Portuguese can still type an English word. The
    // card will show whatever their own locale resolves to.
    expect(await search("haircut")).toEqual(new Set([englishOnly]));
  });

  test("treats a percent sign as text, not as a wildcard", async () => {
    // Unescaped, `%` is ILIKE's "match anything" and this returns all five.
    // The only seeded service with a literal `%` is the one named
    // "Massagem 100% relaxante".
    expect(await search("100%")).toEqual(new Set([withPercent]));
  });

  test("treats an underscore as text, not as a single-character wildcard", async () => {
    // `_` matches any one character, so unescaped "m_nicure" finds "Manicure".
    expect(await search("m_nicure")).toEqual(new Set());
  });

  test("returns everything when no search was asked for", async () => {
    expect(await search(undefined)).toEqual(seeded);
  });
});
