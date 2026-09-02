/**
 * `DrizzleServicePricingReader` against the real dev database, same reason and
 * same mechanism as `slot-validity.reader.test.ts`: the reader reaches the
 * database through `getDb()`, which resolves through the request-scoped
 * AsyncLocalStorage context — a test has no request, so
 * `__runWithTransactionContextForTests` binds this file's own real,
 * `DEV_DB_URL`-backed Drizzle client into that context for the duration of
 * one call.
 *
 * **What this file exists to pin is the locale fallback and the one refusal
 * that hangs off it.** An option's name lives in `service_option_translation`,
 * one row per locale, and nothing anywhere requires such a row to exist:
 * `canPublish` never asks (follow-up #122), and twenty of dev's twenty-four
 * published active options had no row in any locale. The reader used to
 * answer `optionName: ""` for those, which travelled through
 * `CreateBookingCommand` into `Booking.create` and came back to the customer
 * as `BOOKING_FIELD_BLANK` — a booking-shaped complaint about a catalogue
 * row, with the option id gone.
 *
 * The four options below are the whole matrix the fallback can produce:
 * a name in the requested locale, a name only in the source locale, no name
 * at all, and a name that is only whitespace. The first two must answer; the
 * last two must refuse. Fixtures are created under a random `suffix` in
 * `beforeAll` so a concurrent run in another worktree cannot collide with
 * this one.
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import * as authSchema from "../../../../../better-auth/infrastructure/database/schema";
import { __runWithTransactionContextForTests } from "../../../../../../shared/infrastructure/database/tx-context";
import { category } from "../catalog/schemas/category.schema";
import {
  service,
  serviceOption,
  serviceOptionTranslation,
  serviceTranslation,
} from "../catalog/schemas/service.schema";
import { provider } from "../provider/schemas/provider.schema";
import { user } from "../user/schemas/user.schema";
import { ServiceOptionUnnamedError } from "../../../../bounded-contexts/booking/domain/exceptions";
import { DrizzleServicePricingReader } from "../../../../bounded-contexts/booking/infrastructure/repositories/drizzle/service-pricing.reader";
import type { ServiceOptionPricing } from "../../../../bounded-contexts/booking/app/ports/outbound/service-pricing.reader.port";
import {
  bestEffortCleanup,
  DEV_DB_COLD_START_TIMEOUT_MS,
  openDevDbConnection,
} from "./dev-db-test-connection";

setDefaultTimeout(DEV_DB_COLD_START_TIMEOUT_MS);

const sql = openDevDbConnection();
const db = drizzle(sql, { schema: authSchema });

const reader = new DrizzleServicePricingReader();
const suffix = crypto.randomUUID();

/** What the service is written in. Every fallback below resolves to this one. */
const SOURCE_LOCALE = "pt-MZ";
/** A locale the service is *partly* translated into — the requested side of the fallback. */
const OTHER_LOCALE = "fr-FR";

let ownerUserId: string;
let categoryId: string;
let providerId: string;
let serviceId: string;

/** Named in both locales: the requested one must win over the source one. */
let translatedOptionId: string;
/** Named only in the source locale: the fallback must answer, not refuse. */
let sourceOnlyOptionId: string;
/** No `service_option_translation` row at all — dev's twenty. */
let unnamedOptionId: string;
/** A row that exists and holds nothing but spaces. */
let blankOptionId: string;

async function addOption(): Promise<string> {
  const [row] = await db
    .insert(serviceOption)
    .values({
      serviceId,
      pricingMode: "fixed",
      amountMinor: 150_000,
      currency: "MZN",
      durationMinutes: 90,
    })
    .returning({ id: serviceOption.id });
  return row!.id;
}

beforeAll(async () => {
  ownerUserId = crypto.randomUUID();
  await db.insert(user).values({
    id: ownerUserId,
    email: `service-pricing-owner-${suffix}@ntizo.test`,
    role: "customer",
    status: "active",
  });

  const [categoryRow] = await db
    .insert(category)
    .values({ code: `service-pricing-test-${suffix}` })
    .returning({ id: category.id });
  categoryId = categoryRow!.id;

  const [providerRow] = await db
    .insert(provider)
    .values({
      ownerUserId,
      type: "individual",
      name: "Service Pricing Test Provider",
      slug: `service-pricing-test-${suffix}`,
      status: "active",
      timezone: "Africa/Maputo",
    })
    .returning({ id: provider.id });
  providerId = providerRow!.id;

  const [serviceRow] = await db
    .insert(service)
    .values({
      providerId,
      categoryId,
      sourceLocale: SOURCE_LOCALE,
      locationType: "at_provider",
      status: "published",
    })
    .returning({ id: service.id });
  serviceId = serviceRow!.id;

  await db.insert(serviceTranslation).values([
    { serviceId, locale: SOURCE_LOCALE, name: "Avaria eléctrica urgente" },
    { serviceId, locale: OTHER_LOCALE, name: "Panne électrique urgente" },
  ]);

  translatedOptionId = await addOption();
  sourceOnlyOptionId = await addOption();
  unnamedOptionId = await addOption();
  blankOptionId = await addOption();

  await db.insert(serviceOptionTranslation).values([
    { optionId: translatedOptionId, locale: SOURCE_LOCALE, name: "Diagnóstico e reparação" },
    { optionId: translatedOptionId, locale: OTHER_LOCALE, name: "Diagnostic et réparation" },
    { optionId: sourceOnlyOptionId, locale: SOURCE_LOCALE, name: "Só diagnóstico" },
    // Not blank in the column's eyes — `name` is `NOT NULL` and Postgres is
    // perfectly happy with spaces — which is the whole point of the case.
    { optionId: blankOptionId, locale: SOURCE_LOCALE, name: "   " },
  ]);
});

afterAll(async () => {
  // `service_option_translation` and `service_option` both cascade from
  // `service`, so deleting the service is enough for all three — but the
  // steps are listed separately anyway, in dependency order, so a partially
  // run `beforeAll` that never assigned `serviceId` still cleans up whatever
  // it did create.
  await bestEffortCleanup([
    () => db.delete(service).where(eq(service.providerId, providerId)),
    () => db.delete(provider).where(eq(provider.id, providerId)),
    () => db.delete(category).where(eq(category.id, categoryId)),
    () => db.delete(user).where(inArray(user.id, [ownerUserId])),
  ]);
});

function findOption(optionId: string, locale: string): Promise<ServiceOptionPricing | null> {
  return __runWithTransactionContextForTests(db, () => reader.findOption(optionId, locale));
}

describe("DrizzleServicePricingReader.findOption", () => {
  test("snapshots the name in the locale the customer was reading", async () => {
    const pricing = await findOption(translatedOptionId, OTHER_LOCALE);

    expect(pricing?.optionName).toBe("Diagnostic et réparation");
    // The service name follows the same two-step, and is asserted here rather
    // than in its own case so a fallback that quietly resolved *both* fields
    // to the source locale cannot pass by agreeing with itself.
    expect(pricing?.serviceName).toBe("Panne électrique urgente");
  });

  test("falls back to the source locale rather than refusing a translation gap", async () => {
    // A name missing from the customer's locale is not the same failure as a
    // name missing everywhere: this option has a name, in Portuguese, and a
    // booking snapshotted in the language the provider wrote it in is a
    // correct answer. Only the *absence of both* is a refusal.
    const pricing = await findOption(sourceOnlyOptionId, OTHER_LOCALE);

    expect(pricing?.optionName).toBe("Só diagnóstico");
  });

  test("refuses an option with no name in the requested or the source locale", async () => {
    // The defect this file exists for. `""` here reached `Booking.create` and
    // came back as `BOOKING_FIELD_BLANK` — a message with no option id in it,
    // four calls from the query that produced the blank.
    const failure = findOption(unnamedOptionId, OTHER_LOCALE);

    await expect(failure).rejects.toBeInstanceOf(ServiceOptionUnnamedError);
    await expect(failure).rejects.toMatchObject({
      code: "SERVICE_OPTION_UNNAMED",
      serviceOptionId: unnamedOptionId,
      requestedLocale: OTHER_LOCALE,
      sourceLocale: SOURCE_LOCALE,
    });
    // The id is in the message, not only on the error object: what a log line
    // carries is the message, and an operator reading one needs the row.
    await expect(failure).rejects.toThrow(unnamedOptionId);
  });

  test("refuses a name that is only whitespace, the same as a missing one", async () => {
    // `NOT NULL` lets `"   "` through, and every guard downstream trims before
    // it checks. A reader that returned this would put three spaces on a
    // customer's receipt.
    await expect(findOption(blankOptionId, SOURCE_LOCALE)).rejects.toBeInstanceOf(
      ServiceOptionUnnamedError,
    );
  });

  test("still answers null for an option that does not exist", async () => {
    // The refusal above must not have widened into "anything I cannot
    // describe is a throw": a missing option is an answer this port has
    // always given as null, and `CreateBookingCommand` turns it into
    // `SERVICE_OPTION_NOT_FOUND`.
    expect(await findOption(crypto.randomUUID(), SOURCE_LOCALE)).toBeNull();
  });
});
