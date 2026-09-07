/**
 * DB-backed test that the public service page reads `service_quote_form` —
 * the one field this task adds, and the one behaviour that matters about it.
 *
 * Modelled on `catalog-city-facets.test.ts`: real rows in the shared dev
 * database, a unique suffix so nothing here can collide with another
 * worktree's fixtures, and cleanup by id in `afterAll`.
 *
 * Three services under one category prove the three outcomes
 * `getPublishedById` has to tell apart: a `quote` service whose provider
 * filled in the form carries it through exactly; a `priced` service that
 * never had a `service_quote_form` row publishes `null` rather than a form
 * of default values; and a `priced` service that still carries the row it
 * was given while it was in `quote` mode publishes `null` too, because the
 * row outlives the mode and the read is gated on the mode.
 *
 * `responseHours`, `askDeadline`, `askPhotos` and `askLocation` each carry a
 * `.default()` — `intro` carries neither a default nor `.notNull()` — so a
 * projection that fell back to `{}` or to those four defaults instead of
 * `null` would look identical to a hand-typed fixture, and only a real "no
 * row at all" case catches it.
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import * as authSchema from "../../../../../better-auth/infrastructure/database/schema";
import { __runWithTransactionContextForTests } from "../../../../../../shared/infrastructure/database/tx-context";
import { DrizzleServiceReadRepository } from "../../../../bounded-contexts/catalog/infrastructure/repositories/drizzle/service-read.repository";
import type { PerformerReadPort } from "../../../../bounded-contexts/catalog/app/ports/outbound/performer-read.port";
import { GetServiceProjection } from "../../../../public/catalog/app/use-cases/get-service.projection";
import {
  bestEffortCleanup,
  DEV_DB_COLD_START_TIMEOUT_MS,
  openDevDbConnection,
} from "./dev-db-test-connection";
import { category } from "../catalog/schemas/category.schema";
import { service, serviceQuoteForm, serviceTranslation } from "../catalog/schemas/service.schema";
import { provider } from "../provider/schemas/provider.schema";
import { user } from "../user/schemas/user.schema";

setDefaultTimeout(DEV_DB_COLD_START_TIMEOUT_MS);

const sql = openDevDbConnection();
const db = drizzle(sql, { schema: authSchema });
const run = <T>(work: () => Promise<T>) => __runWithTransactionContextForTests(db, work);

const repo = new DrizzleServiceReadRepository();
/** No test here seeds a performer, so an empty result is always correct. */
const noPerformers: PerformerReadPort = { byMemberIds: async () => [] };
const projection = new GetServiceProjection(repo, noPerformers);

const suffix = crypto.randomUUID();

let userId: string;
let providerId: string;
let categoryId: string;
let quoteServiceId: string;
let pricedServiceId: string;
let switchedServiceId: string;

beforeAll(async () => {
  userId = crypto.randomUUID();
  await db.insert(user).values({ id: userId, email: `quote-form-page-${suffix}@example.com` });

  const [p] = await db
    .insert(provider)
    .values({
      ownerUserId: userId,
      type: "individual",
      name: `Quote Form Page ${suffix}`,
      slug: `quote-form-page-${suffix}`,
      status: "active",
    })
    .returning({ id: provider.id });
  providerId = p!.id;

  const [cat] = await db
    .insert(category)
    .values({ code: `quote-form-page-${suffix}` })
    .returning({ id: category.id });
  categoryId = cat!.id;

  const [quoted] = await db
    .insert(service)
    .values({
      providerId,
      categoryId,
      sourceLocale: "pt-MZ",
      locationType: "at_provider",
      bookingMode: "quote",
      status: "published",
    })
    .returning({ id: service.id });
  quoteServiceId = quoted!.id;
  await db.insert(serviceTranslation).values({
    serviceId: quoteServiceId,
    locale: "pt-MZ",
    name: "Fotografia de eventos",
    description: null,
  });
  await db.insert(serviceQuoteForm).values({
    serviceId: quoteServiceId,
    responseHours: 24,
    askDeadline: true,
    askPhotos: true,
    askLocation: false,
    intro: "Conte-me sobre o seu evento e respondo com um orçamento.",
  });

  const [priced] = await db
    .insert(service)
    .values({
      providerId,
      categoryId,
      sourceLocale: "pt-MZ",
      locationType: "at_provider",
      bookingMode: "priced",
      status: "published",
    })
    .returning({ id: service.id });
  pricedServiceId = priced!.id;
  await db.insert(serviceTranslation).values({
    serviceId: pricedServiceId,
    locale: "pt-MZ",
    name: "Corte de cabelo",
    description: null,
  });
  // Deliberately no `service_quote_form` row — this service has never asked
  // for one, which is the case under test.

  // The third case, and the one only the mode gate catches: a service
  // configured in `quote` mode, given a form, and later switched to
  // `priced`. Nothing deletes `service_quote_form` on that switch, so the
  // row is still here — exactly the fixture a projection keyed on "a row
  // exists" would publish a quote form from.
  const [switched] = await db
    .insert(service)
    .values({
      providerId,
      categoryId,
      sourceLocale: "pt-MZ",
      locationType: "at_provider",
      bookingMode: "priced",
      status: "published",
    })
    .returning({ id: service.id });
  switchedServiceId = switched!.id;
  await db.insert(serviceTranslation).values({
    serviceId: switchedServiceId,
    locale: "pt-MZ",
    name: "Manicure",
    description: null,
  });
  await db.insert(serviceQuoteForm).values({
    serviceId: switchedServiceId,
    responseHours: 12,
    askDeadline: false,
    askPhotos: false,
    askLocation: true,
    intro: "Antes vendia por orçamento.",
  });
});

afterAll(async () => {
  await bestEffortCleanup([
    () => db.delete(service).where(eq(service.providerId, providerId)),
    () => db.delete(category).where(eq(category.id, categoryId)),
    () => db.delete(provider).where(eq(provider.id, providerId)),
    () => db.delete(user).where(eq(user.id, userId)),
    () => sql.end({ timeout: 5 }),
  ]);
});

describe("the public service page's quoteForm", () => {
  test("a quote service publishes its form; a priced one publishes null", async () => {
    const quoted = await run(() => projection.execute({ id: quoteServiceId, locale: "pt-MZ" }));
    expect(quoted?.quoteForm).toEqual({
      responseHours: 24,
      askDeadline: true,
      askPhotos: true,
      askLocation: false,
      intro: "Conte-me sobre o seu evento e respondo com um orçamento.",
    });

    const priced = await run(() => projection.execute({ id: pricedServiceId, locale: "pt-MZ" }));
    expect(priced?.quoteForm).toBeNull();
  });

  test("a priced service that still carries a quote-form row publishes null", async () => {
    // The row is really there — assert that first, or the test would also
    // pass against a projection that simply found nothing to publish.
    const rows = await db
      .select()
      .from(serviceQuoteForm)
      .where(eq(serviceQuoteForm.serviceId, switchedServiceId));
    expect(rows).toHaveLength(1);

    const switched = await run(() => projection.execute({ id: switchedServiceId, locale: "pt-MZ" }));
    expect(switched?.bookingMode).toBe("priced");
    expect(switched?.quoteForm).toBeNull();
  });
});
