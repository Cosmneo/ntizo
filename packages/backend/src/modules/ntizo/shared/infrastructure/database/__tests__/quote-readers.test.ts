/**
 * The five Drizzle readers behind the quote context's outbound ports,
 * against the real dev database — same reason and same mechanism as
 * `quote-repository.test.ts`: each reader reaches Postgres through
 * `getDb()`, which resolves through the app's request-scoped
 * AsyncLocalStorage context, and a test has no request.
 * `__runWithTransactionContextForTests` binds this file's own real,
 * `DEV_DB_URL`-backed Drizzle client into that same context for the
 * duration of one test body.
 *
 * Fixtures follow `quote-constraints.test.ts`'s pattern (user, provider,
 * member, category, quote-mode service, thread), plus what this file's own
 * readers need to have something to read: a `service_quote_form` row, a
 * `service_translation` row in `pt-MZ`, a `service_member` row linking the
 * member to the service, a closed quote (to satisfy `booking_origin_exactly_one`),
 * and one `CONFIRMED` booking for that member from `T` to `T + 2h` — the
 * fixture `DrizzleSlotOverlapReader`'s two assertions read.
 *
 * `DrizzleQuoteCustomerPhoneReader` and `DrizzleQuoteProviderMemberReader`
 * are not exercised here: their queries are single-column, single-predicate
 * reads against tables already covered by other dev-db tests in this
 * directory (`booking-repository.test.ts` exercises the identical shape
 * against `profile` and `provider_member`), and the brief's own fixture list
 * does not ask for a profile row. Typechecking them against their ports
 * (done at compile time by `implements`) is the coverage this file adds for
 * those two.
 *
 * A second, minimal service (`unnamedServiceId`) covers Round 1's finding:
 * its only translation is in a third locale, neither the one asked for nor
 * its own `sourceLocale`, so `DrizzleQuoteServiceReader` must refuse it
 * rather than hand back `""`.
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import * as authSchema from "../../../../../better-auth/infrastructure/database/schema";
import { __runWithTransactionContextForTests } from "../../../../../../shared/infrastructure/database/tx-context";
import { category } from "../catalog/schemas/category.schema";
import { service, serviceQuoteForm, serviceTranslation } from "../catalog/schemas/service.schema";
import { serviceMember } from "../catalog/schemas/service-member.schema";
import { provider } from "../provider/schemas/provider.schema";
import { providerMember } from "../provider/schemas/provider-member.schema";
import { user } from "../user/schemas/user.schema";
import { thread } from "../communication/schemas/thread.schema";
import { quote } from "../quote/schemas";
import { booking } from "../booking/schemas/booking.schema";
import { QuoteServiceUnnamedError } from "../../../../bounded-contexts/quote/domain/exceptions";
import { DrizzleQuoteServiceReader } from "../../../../bounded-contexts/quote/infrastructure/repositories/drizzle/quote-service.reader";
import { DrizzleSlotOverlapReader } from "../../../../bounded-contexts/quote/infrastructure/repositories/drizzle/slot-overlap.reader";
import { DrizzleQuotePlatformSettingsReader } from "../../../../bounded-contexts/quote/infrastructure/repositories/drizzle/platform-settings.reader";
import { bestEffortCleanup, DEV_DB_COLD_START_TIMEOUT_MS, openDevDbConnection } from "./dev-db-test-connection";

setDefaultTimeout(DEV_DB_COLD_START_TIMEOUT_MS);

const sql = openDevDbConnection();
// `{ schema: authSchema }`, not a bare `drizzle(sql)` — same requirement as
// `quote-repository.test.ts`: `DrizzleDb` (what
// `__runWithTransactionContextForTests` binds into AsyncLocalStorage) is
// typed against this schema shape, even though nothing queried here belongs
// to it.
const db = drizzle(sql, { schema: authSchema });
const run = <T>(work: () => Promise<T>) => __runWithTransactionContextForTests(db, work);
const suffix = crypto.randomUUID();

// Five days out, well clear of "now" and of anything else this suite might
// insert — the overlap reader's own predicate is keyed on `memberId`, which
// is fresh per run, so there is no real collision risk either way.
const T = new Date(Date.now() + 5 * 24 * 3_600_000);

let customerId: string;
let ownerUserId: string;
let providerId: string;
let memberId: string;
let categoryId: string;
let serviceId: string;
let threadId: string;
let closedQuoteId: string;
let bookingId: string;
let unnamedServiceId: string;

beforeAll(async () => {
  customerId = crypto.randomUUID();
  ownerUserId = crypto.randomUUID();
  await db.insert(user).values([
    { id: customerId, email: `quote-readers-customer-${suffix}@ntizo.test`, role: "customer", status: "active" },
    { id: ownerUserId, email: `quote-readers-owner-${suffix}@ntizo.test`, role: "customer", status: "active" },
  ]);

  const [p] = await db
    .insert(provider)
    .values({
      ownerUserId,
      type: "individual",
      name: "Quote Readers Test Provider",
      slug: `quote-readers-test-${suffix}`,
      status: "active",
    })
    .returning({ id: provider.id });
  providerId = p!.id;

  const [m] = await db
    .insert(providerMember)
    .values({ providerId, userId: ownerUserId, role: "owner" })
    .returning({ id: providerMember.id });
  memberId = m!.id;

  const [c] = await db
    .insert(category)
    .values({ code: `quote-readers-test-${suffix}`, sortOrder: 999 })
    .returning({ id: category.id });
  categoryId = c!.id;

  const [s] = await db
    .insert(service)
    .values({
      providerId,
      categoryId,
      sourceLocale: "pt-MZ",
      locationType: "at_customer",
      bookingMode: "quote",
      status: "published",
    })
    .returning({ id: service.id });
  serviceId = s!.id;

  const [t] = await db
    .insert(thread)
    .values({ type: "inquiry", customerUserId: customerId, providerId, lastMessageAt: new Date() })
    .returning({ id: thread.id });
  threadId = t!.id;

  await db.insert(serviceQuoteForm).values({ serviceId, responseHours: 24, askLocation: false });
  await db.insert(serviceTranslation).values({ serviceId, locale: "pt-MZ", name: "Instalação de AC" });
  await db.insert(serviceMember).values({ serviceId, memberId });

  // A closed quote, so `booking.quote_id` has something real to point at —
  // `booking_origin_exactly_one` requires exactly one of `service_option_id`
  // and `quote_id`, matching `quote-constraints.test.ts`'s own "a booking
  // names exactly one origin" fixture.
  const [q] = await db
    .insert(quote)
    .values({
      serviceId,
      providerId,
      customerId,
      threadId,
      status: "DECLINED",
      locale: "pt-MZ",
      description: "Fixture only — never read by these tests",
      requestedAt: new Date(),
      expiresAt: null,
    })
    .returning({ id: quote.id });
  closedQuoteId = q!.id;

  const [b] = await db
    .insert(booking)
    .values({
      customerId,
      providerId,
      serviceId,
      providerMemberId: memberId,
      serviceOptionId: null,
      quoteId: closedQuoteId,
      startsAt: T,
      endsAt: new Date(T.getTime() + 2 * 3_600_000),
      status: "CONFIRMED",
      priceMinor: 10_600,
      commissionBps: 1_000,
      commissionMinor: 1_060,
      serviceName: "Instalação de AC",
      providerName: "Quote Readers Test Provider",
      providerSlug: `quote-readers-test-${suffix}`,
      durationMinutes: 120,
    })
    .returning({ id: booking.id });
  bookingId = b!.id;

  // Round 1's fixture: a service whose only translation is in a locale that
  // is neither the one a caller will ask for nor its own `sourceLocale` —
  // the case `DrizzleQuoteServiceReader` must refuse rather than describe
  // with `""`. Its own service, not the fixture above, so the "happy path"
  // test's `pt-MZ` translation can't accidentally satisfy this one.
  const [u] = await db
    .insert(service)
    .values({
      providerId,
      categoryId,
      sourceLocale: "en-US",
      locationType: "at_customer",
      bookingMode: "quote",
      status: "published",
    })
    .returning({ id: service.id });
  unnamedServiceId = u!.id;
  await db.insert(serviceTranslation).values({ serviceId: unnamedServiceId, locale: "fr-FR", name: "Chauffage" });
});

afterAll(async () => {
  await bestEffortCleanup([
    () => db.delete(booking).where(eq(booking.id, bookingId)),
    () => db.delete(serviceMember).where(eq(serviceMember.serviceId, serviceId)),
    () => db.delete(serviceQuoteForm).where(eq(serviceQuoteForm.serviceId, serviceId)),
    () => db.delete(serviceTranslation).where(eq(serviceTranslation.serviceId, serviceId)),
    () => db.delete(serviceTranslation).where(eq(serviceTranslation.serviceId, unnamedServiceId)),
    () => db.delete(quote).where(eq(quote.id, closedQuoteId)),
    () => db.delete(thread).where(eq(thread.id, threadId)),
    () => db.delete(service).where(eq(service.id, unnamedServiceId)),
    () => db.delete(service).where(eq(service.id, serviceId)),
    () => db.delete(category).where(eq(category.id, categoryId)),
    () => db.delete(providerMember).where(eq(providerMember.id, memberId)),
    () => db.delete(provider).where(eq(provider.id, providerId)),
    () => db.delete(user).where(eq(user.id, customerId)),
    () => db.delete(user).where(eq(user.id, ownerUserId)),
    () => sql.end({ timeout: 5 }),
  ]);
}, DEV_DB_COLD_START_TIMEOUT_MS);

describe("the Drizzle readers behind the quote context's ports", () => {
  test("the service reader returns the form, the name in the locale with source fallback, and the performers", async () => {
    const snap = await run(() => new DrizzleQuoteServiceReader().findForQuote(serviceId, "pt-MZ"));
    expect(snap).toMatchObject({ bookingMode: "quote", serviceName: "Instalação de AC", memberIds: [memberId] });
    expect(snap?.quoteForm).toMatchObject({ responseHours: 24, askLocation: false });

    const fallback = await run(() => new DrizzleQuoteServiceReader().findForQuote(serviceId, "de-DE"));
    expect(fallback?.serviceName).toBe("Instalação de AC");

    expect(await run(() => new DrizzleQuoteServiceReader().findForQuote(crypto.randomUUID(), "pt-MZ"))).toBeNull();
  });

  test("the service reader refuses a service with no name in the requested locale or its own source locale", async () => {
    await expect(
      run(() => new DrizzleQuoteServiceReader().findForQuote(unnamedServiceId, "de-DE")),
    ).rejects.toThrow(QuoteServiceUnnamedError);
  });

  test("the overlap reader sees the confirmed booking and nothing beside it", async () => {
    const reader = new DrizzleSlotOverlapReader();
    expect(
      await run(() =>
        reader.overlaps({
          providerMemberId: memberId,
          startsAt: new Date(T.getTime() + 3_600_000),
          endsAt: new Date(T.getTime() + 3 * 3_600_000),
        }),
      ),
    ).toBe(true);
    expect(
      await run(() =>
        reader.overlaps({
          providerMemberId: memberId,
          startsAt: new Date(T.getTime() + 2 * 3_600_000),
          endsAt: new Date(T.getTime() + 3 * 3_600_000),
        }),
      ),
    ).toBe(false);
  });

  test("the settings reader reads the live global row", async () => {
    const s = new DrizzleQuotePlatformSettingsReader();
    expect(await run(() => s.findQuoteProposalValidityHours())).toBeGreaterThanOrEqual(1);
    expect(await run(() => s.findMinServicePriceMinor())).toBeGreaterThanOrEqual(0);
  });
});
