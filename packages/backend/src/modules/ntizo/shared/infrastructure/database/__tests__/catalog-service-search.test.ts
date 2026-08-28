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
 * Every query below is scoped to this run's own category — a code nothing
 * else in the database has ever carried — so the rows the search chooses
 * between are exactly the five seeded here. That scope, not the page size, is
 * what makes these assertions deterministic: this runs against the shared dev
 * database, whose published services number in the hundreds and grow, and
 * `listPublished`'s default page is `sort_order, created_at` ascending with a
 * `LIMIT` — oldest first. Rows seeded a moment ago are the newest rows there
 * are, so an unscoped query pages straight past them and the test fails for a
 * reason that has nothing to do with the predicate it is about. Filtering the
 * *result* would not have helped either: the fixtures are not in the page to
 * be filtered.
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
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

/**
 * The keys teardown deletes by, all decided here rather than handed back by
 * `beforeAll`.
 *
 * A hook bun:test has given up on keeps running — its `await`s resume, and
 * `afterAll` starts alongside them. Teardown that deletes by ids `beforeAll`
 * returned therefore has nothing to delete by exactly when it matters most,
 * on the run that failed partway. These are known before a single row exists.
 */
const categoryCode = `svc-search-test-${suffix}`;
const providerSlugs = [`svc-search-a-${suffix}`, `svc-search-b-${suffix}`] as const;
const userAId = crypto.randomUUID();
const userBId = crypto.randomUUID();

let providerAId: string;
let providerBId: string;
let categoryId: string;

/** Matches "corte" by its own name. */
let byName: string;
/** Matches "corte" only in its description — its name is about something else. */
let byDescription: string;
/** Written only in English: matches "haircut", and must NOT match "corte". */
let englishOnly: string;
/**
 * Contains "100" but no `%`. The row that tells the two readings of a search
 * for "100%" apart: escaped, the pattern is `%100\%%` and only matches the
 * literal; unescaped it is `%100%%`, which is just "contains 100" and matches
 * this too. Without it the percent test passes either way.
 */
let hundredNoPercent: string;
/** Carries a literal `%`, the character an unescaped `ILIKE` reads as "anything". */
let withPercent: string;
/** Matches "corte" only through its provider's name. */
let byProviderName: string;

/** Every service this test seeded — the entire population its own category holds. */
let seeded: Set<string> = new Set();

/**
 * `beforeAll`'s own promise, so `afterAll` can wait for it.
 *
 * Not redundant with awaiting the hook: when a hook exceeds bun:test's
 * timeout, bun:test stops waiting but the hook does not stop running, and
 * teardown that starts while seeding is still inserting deletes rows that are
 * created a moment after it looked. Measured on the shared dev database: the
 * one `service_member` row of every leaked run of `catalog-unpublish-sweep`
 * was deleted by `afterAll` and then re-inserted by the `beforeAll` bun:test
 * had already declared failed.
 */
let seeding: Promise<unknown> = Promise.resolve();

beforeAll(() => (seeding = seed()));

async function seed(): Promise<void> {
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
    .values({ code: categoryCode })
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
  hundredNoPercent = await makeService(providerAId, "pt-MZ", "Pacote 100 fotos", null);
  byProviderName = await makeService(providerBId, "pt-MZ", "Massagem de pedras", null);

  seeded = new Set([
    byName,
    byDescription,
    englishOnly,
    withPercent,
    hundredNoPercent,
    byProviderName,
  ]);
}

/**
 * Three statements, keyed on names this file chose, not on ids seeding
 * returned — and in this order, which is the order the foreign keys allow.
 *
 * Deleting the providers is what removes the services: `service.provider_id`
 * cascades, and so do `service_translation`, `service_member` and
 * `provider_member` behind it. Sixteen statements deleting each row by id, as
 * this used to be, is sixteen round trips sharing one hook budget — and a
 * teardown that runs out of budget halfway leaves everything after the cut,
 * which is how the fixtures of fifteen separate runs came to be sitting in
 * the dev database.
 *
 * The category can only go once no service references it (that FK does not
 * cascade), and the users only once no provider owns them (nor does that
 * one) — so: providers, then category, then users.
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

/**
 * What a search returns, as a set of ids.
 *
 * Scoped to this run's own category, so the result *is* the fixtures: not a
 * page of the shared dev database that the fixtures might or might not have
 * made it into. `limit` stays at the browse's real page size so the query
 * keeps its production shape, but five rows can never fill it.
 */
async function search(q: string | undefined): Promise<Set<string>> {
  const rows = await __runWithTransactionContextForTests(db, () =>
    repo.listPublished({ q, categoryCode, limit: 48, offset: 0 }),
  );
  return new Set(rows.map((r) => r.id));
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
    // The whole set, not `not.toContain`: "the English-only service is
    // absent" is also true of an empty result, and an empty result is what a
    // search that has stopped working returns. Naming the three that must be
    // there says the predicate is a filter rather than a no-op — an `EXISTS`
    // correlated on the wrong column returns every row, and the three
    // `toContain` assertions above would still pass — and that it is not the
    // opposite no-op either.
    expect(await search("corte")).toEqual(new Set([byName, byDescription, byProviderName]));
  });

  test("ignores case", async () => {
    // Spelled out rather than compared against `search("corte")`: two empty
    // sets are equal, so a comparison of the two would survive the search
    // matching nothing at all.
    expect(await search("CORTE")).toEqual(new Set([byName, byDescription, byProviderName]));
  });

  test("searches every translation, not only the platform's language", async () => {
    // Somebody browsing in Portuguese can still type an English word. The
    // card will show whatever their own locale resolves to.
    expect(await search("haircut")).toEqual(new Set([englishOnly]));
  });

  test("treats a percent sign as text, not as a wildcard", async () => {
    // Both rows carry "100"; only "Massagem 100% relaxante" carries the `%`.
    // Escaped, "100%" is a search for that literal and finds one of them.
    // Unescaped it degrades to "contains 100" and finds both — which is why
    // the row without the sign has to be here for this to mean anything.
    expect(await search("100")).toEqual(new Set([withPercent, hundredNoPercent]));
    expect(await search("100%")).toEqual(new Set([withPercent]));
  });

  test("treats an underscore as text, not as a single-character wildcard", async () => {
    // `_` matches any one character, so unescaped "m_nicure" finds "Manicure".
    // The correct spelling is asserted first: on its own, "this returns
    // nothing" is what a search that finds nothing for anything also returns.
    expect(await search("manicure")).toEqual(new Set([byDescription]));
    expect(await search("m_nicure")).toEqual(new Set());
  });

  test("returns everything when no search was asked for", async () => {
    // Everything meaning every published service of an active provider in
    // this run's category — all five, including the two no "corte" search
    // reaches. An absent `q` adds no condition at all, which is the whole
    // claim: the browse with no search box filled in is the full listing.
    expect(await search(undefined)).toEqual(seeded);
  });
});
