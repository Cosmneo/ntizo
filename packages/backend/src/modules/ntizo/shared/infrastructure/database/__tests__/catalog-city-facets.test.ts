/**
 * DB-backed test that the `/services` city facet counts agree with the city
 * filter they link to.
 *
 * A facet count is a promise about a link: "Beira 1" says that clicking it
 * returns one service. `conditionsFor` matches `city OR remote`, so the link
 * returns that one service *plus every remote service on the platform* — and a
 * count grouped by city alone said 1. The number was wrong about its own
 * destination, and nothing in the suite could see it: the two live in
 * different methods, and every unit test of either replaces the other.
 *
 * So this asserts the only thing that settles it — `listCityFacets()`'s count
 * for a city equals `countPublished({ city })` for the same city, run against
 * the same rows. That equality holds no matter what else is in the shared dev
 * database, which is why it is the assertion rather than a fixed number: both
 * sides count everything, so both move together.
 *
 * The rows are shaped so the two disagree unless the facet folds the remote
 * population in: one city with a service that is *not* remote, one city whose
 * only service *is*. The second is also the case a naive fix drops — filtering
 * remote rows out of the query rather than out of the count would delete that
 * city from the sidebar entirely, while its link still returns results.
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
import { service } from "../catalog/schemas/service.schema";
import { provider } from "../provider/schemas/provider.schema";
import { user } from "../user/schemas/user.schema";

setDefaultTimeout(DEV_DB_COLD_START_TIMEOUT_MS);

const sql = openDevDbConnection();
const db = drizzle(sql, { schema: authSchema });
const repo = new DrizzleServiceReadRepository();

const suffix = crypto.randomUUID();

/** Unique per run, so no other row in the shared database lands in either group. */
const CITY_ONSITE = `Facettown-${suffix}`;
const CITY_REMOTE_ONLY = `Farville-${suffix}`;

let userAId: string;
let userBId: string;
let providerAId: string;
let providerBId: string;
let categoryId: string;
let onsiteServiceId: string;
let remoteServiceId: string;

beforeAll(async () => {
  userAId = crypto.randomUUID();
  userBId = crypto.randomUUID();
  await db.insert(user).values([
    { id: userAId, email: `facets-a-${suffix}@example.com` },
    { id: userBId, email: `facets-b-${suffix}@example.com` },
  ]);

  const [a] = await db
    .insert(provider)
    .values({
      ownerUserId: userAId,
      type: "individual",
      name: `Facets A ${suffix}`,
      slug: `facets-a-${suffix}`,
      status: "active",
      addressCity: CITY_ONSITE,
    })
    .returning({ id: provider.id });
  providerAId = a!.id;

  const [b] = await db
    .insert(provider)
    .values({
      ownerUserId: userBId,
      type: "individual",
      name: `Facets B ${suffix}`,
      slug: `facets-b-${suffix}`,
      status: "active",
      addressCity: CITY_REMOTE_ONLY,
    })
    .returning({ id: provider.id });
  providerBId = b!.id;

  const [cat] = await db
    .insert(category)
    .values({ code: `facets-test-${suffix}` })
    .returning({ id: category.id });
  categoryId = cat!.id;

  const [onsite] = await db
    .insert(service)
    .values({
      providerId: providerAId,
      categoryId,
      sourceLocale: "pt-MZ",
      locationType: "at_provider",
      status: "published",
    })
    .returning({ id: service.id });
  onsiteServiceId = onsite!.id;

  const [remote] = await db
    .insert(service)
    .values({
      providerId: providerBId,
      categoryId,
      sourceLocale: "pt-MZ",
      locationType: "remote",
      status: "published",
    })
    .returning({ id: service.id });
  remoteServiceId = remote!.id;
});

afterAll(async () => {
  await bestEffortCleanup([
    () => db.delete(service).where(eq(service.id, onsiteServiceId)),
    () => db.delete(service).where(eq(service.id, remoteServiceId)),
    () => db.delete(category).where(eq(category.id, categoryId)),
    () => db.delete(provider).where(eq(provider.id, providerAId)),
    () => db.delete(provider).where(eq(provider.id, providerBId)),
    () => db.delete(user).where(eq(user.id, userAId)),
    () => db.delete(user).where(eq(user.id, userBId)),
    () => sql.end({ timeout: 5 }),
  ]);
});

const facets = () =>
  __runWithTransactionContextForTests(db, () => repo.listCityFacets());
const countFor = (city: string) =>
  __runWithTransactionContextForTests(db, () => repo.countPublished({ city }));
const idsFor = async (city: string) =>
  new Set(
    (
      await __runWithTransactionContextForTests(db, () =>
        repo.listPublished({ city, limit: 200, offset: 0 }),
      )
    ).map((r) => r.id),
  );

describe("the city facets and the city filter", () => {
  test("a city link returns the remote services too, which is why the counts differ", async () => {
    // The premise the whole file rests on, asserted live rather than assumed:
    // filtering by a city that has exactly one on-site service also returns a
    // remote service belonging to a provider in a different city entirely.
    const ids = await idsFor(CITY_ONSITE);
    expect(ids).toContain(onsiteServiceId);
    expect(ids).toContain(remoteServiceId);
  });

  test("the count beside a city is the number that city's link returns", async () => {
    const row = (await facets()).find((f) => f.city === CITY_ONSITE);
    expect(row).toBeDefined();
    expect(row!.count).toBe(await countFor(CITY_ONSITE));
  });

  test("a city whose only service is remote is still listed, with the count its link returns", async () => {
    // The case a fix that filtered remote rows out of the *query* would drop:
    // this city has nothing but a remote service, so it would vanish from the
    // sidebar while its link went on returning results.
    const row = (await facets()).find((f) => f.city === CITY_REMOTE_ONLY);
    expect(row).toBeDefined();
    expect(row!.count).toBe(await countFor(CITY_REMOTE_ONLY));
  });

  test("no remote service is counted twice for its own provider's city", async () => {
    // `CITY_REMOTE_ONLY`'s own service is remote. Adding the remote population
    // on top of a group that still contained it would count that one twice,
    // and the equality above is what catches it — this states the arithmetic
    // the equality is protecting, so a later reader knows what it is for.
    const onsite = (await facets()).find((f) => f.city === CITY_ONSITE)!;
    const remoteOnly = (await facets()).find((f) => f.city === CITY_REMOTE_ONLY)!;
    expect(onsite.count).toBe(remoteOnly.count + 1);
  });
});
