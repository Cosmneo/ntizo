/**
 * DB-backed test that a directory row carries the cheapest three things a
 * business sells, cheapest first, and that a business which only quotes
 * carries none.
 *
 * `DrizzleProviderPublicRepository.servicesFor` joins `service`,
 * `service_option` and a grouped `service_translation` subquery — three
 * tables no unit test double can stand in for at once. Modelled on
 * `catalog-city-facets.test.ts`: real rows in the shared dev database, a
 * unique suffix on everything that could collide with another row, and a
 * single unique city so `listActive`'s own city filter is what isolates this
 * file's providers from the rest of the table.
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import * as authSchema from "../../../../../better-auth/infrastructure/database/schema";
import { __runWithTransactionContextForTests } from "../../../../../../shared/infrastructure/database/tx-context";
import { DrizzleProviderPublicRepository } from "../../../../public/provider/infra/repositories/drizzle/provider-public.repository";
import {
  bestEffortCleanup,
  DEV_DB_COLD_START_TIMEOUT_MS,
  openDevDbConnection,
} from "./dev-db-test-connection";
import { category } from "../catalog/schemas/category.schema";
import { service, serviceOption, serviceTranslation } from "../catalog/schemas/service.schema";
import { provider } from "../provider/schemas/provider.schema";
import { user } from "../user/schemas/user.schema";

setDefaultTimeout(DEV_DB_COLD_START_TIMEOUT_MS);

const sql = openDevDbConnection();
const db = drizzle(sql, { schema: authSchema });
const repo = new DrizzleProviderPublicRepository();

const suffix = crypto.randomUUID();

/** Unique per run, so no other row in the shared database lands in this page. */
const CITY = `Chiptown-${suffix}`;
const LOCALE = "pt-MZ";

const userIds: string[] = [];
const providerIds: string[] = [];
const serviceIds: string[] = [];
let categoryId: string;

let studioProviderId: string;
let quoteOnlyProviderId: string;
let multiOptionProviderId: string;
let duplicateNameProviderId: string;

async function seedProvider(overrides: { name: string }): Promise<string> {
  const userId = crypto.randomUUID();
  userIds.push(userId);
  await db.insert(user).values({ id: userId, email: `chip-${crypto.randomUUID()}@example.com` });

  const [row] = await db
    .insert(provider)
    .values({
      ownerUserId: userId,
      type: "individual",
      name: `${overrides.name} ${suffix}`,
      slug: `chip-${crypto.randomUUID()}`,
      status: "active",
      addressCity: CITY,
    })
    .returning({ id: provider.id });
  providerIds.push(row!.id);
  return row!.id;
}

async function seedPublishedService(
  providerId: string,
  overrides: { name: string; amountMinor?: number; bookingMode?: "priced" | "quote" },
): Promise<string> {
  const bookingMode = overrides.bookingMode ?? "priced";

  const [row] = await db
    .insert(service)
    .values({
      providerId,
      categoryId,
      sourceLocale: LOCALE,
      locationType: "at_provider",
      bookingMode,
      status: "published",
    })
    .returning({ id: service.id });
  const serviceId = row!.id;
  serviceIds.push(serviceId);

  // The service's name lives in `service_translation`, not on `service`
  // itself — unsuffixed, because the assertions below match it verbatim and
  // isolation from the rest of the shared database already comes from the
  // unique `CITY` above, not from the service's own name.
  await db.insert(serviceTranslation).values({
    serviceId,
    locale: LOCALE,
    name: overrides.name,
  });

  if (bookingMode === "priced") {
    await db.insert(serviceOption).values({
      serviceId,
      pricingMode: "fixed",
      amountMinor: overrides.amountMinor ?? 10_000,
      currency: "MZN",
      durationMinutes: 30,
      isActive: true,
    });
  }

  return serviceId;
}

/** A second active option on an already-seeded priced service. */
async function addActiveOption(serviceId: string, amountMinor: number): Promise<void> {
  await db.insert(serviceOption).values({
    serviceId,
    pricingMode: "fixed",
    amountMinor,
    currency: "MZN",
    durationMinutes: 30,
    isActive: true,
  });
}

beforeAll(async () => {
  const [cat] = await db
    .insert(category)
    .values({ code: `chip-test-${suffix}` })
    .returning({ id: category.id });
  categoryId = cat!.id;

  studioProviderId = await seedProvider({ name: "Estudio Mavalane" });
  await seedPublishedService(studioProviderId, { name: "Corte com barba", amountMinor: 80_000 });
  await seedPublishedService(studioProviderId, { name: "Barba", amountMinor: 45_000 });
  await seedPublishedService(studioProviderId, { name: "Corte infantil", amountMinor: 35_000 });
  await seedPublishedService(studioProviderId, { name: "Trancas", amountMinor: 250_000 });

  quoteOnlyProviderId = await seedProvider({ name: "Mestre Zunguze" });
  await seedPublishedService(quoteOnlyProviderId, { name: "Reparacao", bookingMode: "quote" });

  // One service, two active options at different prices — the case the
  // dedupe has to collapse to a single chip, at the cheaper of the two.
  multiOptionProviderId = await seedProvider({ name: "Salao Compacto" });
  const twoOptionServiceId = await seedPublishedService(multiOptionProviderId, {
    name: "Manicure",
    amountMinor: 60_000,
  });
  await addActiveOption(twoOptionServiceId, 40_000);

  // Two distinct services that happen to translate to the same name — the
  // case the dedupe must NOT collapse: two services, two chips.
  duplicateNameProviderId = await seedProvider({ name: "Duas Portas" });
  await seedPublishedService(duplicateNameProviderId, { name: "Consulta", amountMinor: 20_000 });
  await seedPublishedService(duplicateNameProviderId, { name: "Consulta", amountMinor: 30_000 });
});

afterAll(async () => {
  await bestEffortCleanup([
    () => db.delete(serviceOption).where(inArray(serviceOption.serviceId, serviceIds)),
    () => db.delete(serviceTranslation).where(inArray(serviceTranslation.serviceId, serviceIds)),
    () => db.delete(service).where(inArray(service.id, serviceIds)),
    () => db.delete(category).where(eq(category.id, categoryId)),
    () => db.delete(provider).where(inArray(provider.id, providerIds)),
    () => db.delete(user).where(inArray(user.id, userIds)),
    () => sql.end({ timeout: 5 }),
  ]);
});

const page = () =>
  __runWithTransactionContextForTests(db, () =>
    repo.listActive({ limit: 20, offset: 0, locale: LOCALE, city: CITY }),
  );

describe("DrizzleProviderPublicRepository — services on a directory row", () => {
  test("carries the three cheapest services, cheapest first, with the total left on serviceCount", async () => {
    const { items } = await page();
    const row = items.find((p) => p.id === studioProviderId)!;

    expect(row.services.map((s) => s.name)).toEqual(["Corte infantil", "Barba", "Corte com barba"]);
    expect(row.serviceCount).toBe(4);
  });

  test("returns an empty list, not a zero, for a business that only quotes", async () => {
    const { items } = await page();
    expect(items.find((p) => p.id === quoteOnlyProviderId)!.services).toEqual([]);
  });

  test("collapses two active options of the same service into one chip, at the cheaper price", async () => {
    // The dedupe keys on the service id, not the row's price or name — this
    // is the case a name-only dedupe would still have passed, since both
    // rows here already share a name. Two option rows for the one service
    // must still produce exactly one chip.
    const { items } = await page();
    const row = items.find((p) => p.id === multiOptionProviderId)!;
    expect(row.services).toHaveLength(1);
    expect(row.services[0]).toMatchObject({ name: "Manicure", amountMinor: 40_000 });
  });

  test("keeps two distinct services that translate to the same name as two separate chips", async () => {
    // The case a name-keyed dedupe collapsed: two different services, same
    // translated name, must still produce two chips — this is what pins the
    // fix to `service.id` rather than `row.name`.
    const { items } = await page();
    const row = items.find((p) => p.id === duplicateNameProviderId)!;
    expect(row.services).toHaveLength(2);
    expect(row.services.every((s) => s.name === "Consulta")).toBe(true);
    expect(row.services.map((s) => s.amountMinor).sort((a, b) => a - b)).toEqual([20_000, 30_000]);
  });
});
