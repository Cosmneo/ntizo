/**
 * `DrizzleQuoteReadRepository` against the real dev database — same reason
 * and same mechanism as `booking-read.repository.test.ts` and
 * `quote-readers.test.ts`: the `WHERE` clause that decides whose quote this
 * is, the CASE the tab counts share, and the locale-fallback join that names
 * the service are joins and predicates a fake repository could not prove.
 *
 * `getDb()` resolves through the app's request-scoped AsyncLocalStorage
 * context and a test has no request, so every body runs inside
 * `__runWithTransactionContextForTests` with this file's own `DEV_DB_URL`
 * client bound into it, exactly as the neighbouring files do.
 *
 * **Two customers and two providers, and that is the point of the fixture
 * rather than thoroughness.** A fixture holding one person's data passes
 * whether or not the ownership filter exists: `listForCustomer` with no
 * `customerId` in its `WHERE` still returns "the right rows" when only one
 * person has any. The second customer and the second workspace are what make
 * the two isolation tests below able to fail.
 *
 * Every row is created once in `beforeAll` under a random `suffix` — so this
 * run cannot collide with another worktree's on `provider.slug` or on
 * `quote_open_per_customer_service_uq` — and deleted in `afterAll`. Nothing
 * is written inside a test body, so nothing has to be reset between them.
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import * as authSchema from "../../../../better-auth/infrastructure/database/schema";
import { __runWithTransactionContextForTests } from "../../../../../shared/infrastructure/database/tx-context";
import { category } from "../../../shared/infrastructure/database/catalog/schemas/category.schema";
import {
  service,
  serviceTranslation,
} from "../../../shared/infrastructure/database/catalog/schemas/service.schema";
import { serviceMember } from "../../../shared/infrastructure/database/catalog/schemas/service-member.schema";
import { provider } from "../../../shared/infrastructure/database/provider/schemas/provider.schema";
import { providerMember } from "../../../shared/infrastructure/database/provider/schemas/provider-member.schema";
import { profile } from "../../../shared/infrastructure/database/user/schemas/profile.schema";
import { user } from "../../../shared/infrastructure/database/user/schemas/user.schema";
import { thread } from "../../../shared/infrastructure/database/communication/schemas/thread.schema";
import { booking } from "../../../shared/infrastructure/database/booking/schemas";
import {
  quote,
  quoteAttachment,
  quoteProposal,
} from "../../../shared/infrastructure/database/quote/schemas";
import { DrizzleQuoteReadRepository } from "../infra/repositories/drizzle/quote-read.repository";
import { toCustomerQuoteDetailDTO } from "../app/use-cases/to-customer-quote-dto";
import {
  toProviderQuoteDTO,
  toProviderQuoteDetailDTO,
} from "../app/use-cases/to-provider-quote-dto";
import {
  bestEffortCleanup,
  DEV_DB_COLD_START_TIMEOUT_MS,
  openDevDbConnection,
} from "../../../shared/infrastructure/database/__tests__/dev-db-test-connection";

setDefaultTimeout(DEV_DB_COLD_START_TIMEOUT_MS);

const sql = openDevDbConnection();
// `{ schema: authSchema }`, not a bare `drizzle(sql)` — `DrizzleDb` (what
// `__runWithTransactionContextForTests` binds into AsyncLocalStorage) is
// typed against this schema shape, even though nothing queried here belongs
// to it.
const db = drizzle(sql, { schema: authSchema });
const run = <T>(work: () => Promise<T>) => __runWithTransactionContextForTests(db, work);

const repo = new DrizzleQuoteReadRepository();
const suffix = crypto.randomUUID();
const NOW = new Date("2026-09-07T12:00:00.000Z");
const hoursOut = (n: number) => new Date(NOW.getTime() + n * 3_600_000);

/** The five closed statuses, plus the two live ones, is the whole of `QUOTE_STATUSES`. */
const CLOSED = ["ACCEPTED", "DECLINED", "REJECTED", "WITHDRAWN", "EXPIRED"] as const;

let customerId: string;
let otherCustomerId: string;
let ownerUserId: string;
let otherOwnerUserId: string;
let providerId: string;
let otherProviderId: string;
let memberId: string;
let otherMemberId: string;
let categoryId: string;
let serviceId: string;
let secondServiceId: string;
let otherServiceId: string;
let threadId: string;
let otherThreadId: string;
let namelessThreadId: string;
/** The `REQUESTED` quote every isolation test tries to reach from the wrong side. */
let quoteId: string;
let proposedQuoteId: string;
let acceptedQuoteId: string;
let otherQuoteId: string;
/** A customer who never filled their name in, and the quote a workspace reads them through. */
let namelessCustomerId: string;
let namelessQuoteId: string;
/** The local part of that customer's address — the string that must never reach a workspace. */
let namelessLocalPart: string;
let proposalId: string;
let attachmentId: string;
let bookingId: string;

async function seedQuote(input: {
  customerId: string;
  providerId: string;
  serviceId: string;
  threadId: string;
  status: string;
  expiresAt: Date | null;
  createdAt?: Date;
  expiredCause?: string;
  closedReason?: string;
  closedNote?: string;
  description?: string;
}): Promise<string> {
  const [row] = await db
    .insert(quote)
    .values({
      serviceId: input.serviceId,
      providerId: input.providerId,
      customerId: input.customerId,
      threadId: input.threadId,
      status: input.status,
      locale: "pt-MZ",
      description: input.description ?? "Preciso de instalar um ar condicionado na sala.",
      neededBy: "2026-10-01",
      addressLabel: "Casa",
      addressLine: "Av. Julius Nyerere 123",
      addressCity: "Maputo",
      addressDistrict: "Sommerschield",
      addressDirections: "Portão azul, tocar a campainha",
      expiresAt: input.expiresAt,
      expiredCause: input.expiredCause ?? null,
      closedReason: input.closedReason ?? null,
      closedNote: input.closedNote ?? null,
      requestedAt: NOW,
      createdAt: input.createdAt ?? NOW,
    })
    .returning({ id: quote.id });
  return row!.id;
}

beforeAll(async () => {
  customerId = crypto.randomUUID();
  otherCustomerId = crypto.randomUUID();
  ownerUserId = crypto.randomUUID();
  otherOwnerUserId = crypto.randomUUID();
  namelessCustomerId = crypto.randomUUID();
  // A plausible real name in the local part, on purpose: this is the exact
  // string a workspace must not be shown. `joao.silva` is a name, not an
  // opaque token, which is why an address-derived fallback would be a leak
  // rather than a cosmetic wart.
  namelessLocalPart = `joao.silva-${suffix}`;

  await db.insert(user).values([
    { id: customerId, email: `quote-read-ana-${suffix}@ntizo.test`, role: "customer", status: "active" },
    { id: otherCustomerId, email: `quote-read-bea-${suffix}@ntizo.test`, role: "customer", status: "active" },
    { id: ownerUserId, email: `quote-read-owner-${suffix}@ntizo.test`, role: "customer", status: "active" },
    { id: otherOwnerUserId, email: `quote-read-owner2-${suffix}@ntizo.test`, role: "customer", status: "active" },
    { id: namelessCustomerId, email: `${namelessLocalPart}@ntizo.test`, role: "customer", status: "active" },
  ]);
  await db.insert(profile).values([
    { userId: customerId, firstName: "Ana" },
    { userId: otherCustomerId, firstName: "Bea" },
    { userId: ownerUserId, firstName: "Carlos" },
    // The reachable case the fix is about: registration writes a profile row
    // with `first_name` at its `NOT NULL DEFAULT ''`, so "never set a name"
    // arrives as a blank string rather than a missing row.
    { userId: namelessCustomerId, firstName: "" },
    // `otherOwnerUserId` deliberately has no profile row at all — the left
    // joins have to survive that too.
  ]);

  const providers = await db
    .insert(provider)
    .values([
      {
        ownerUserId,
        type: "individual",
        name: "Quote Read Test Provider",
        slug: `quote-read-test-${suffix}`,
        status: "active",
        timezone: "Africa/Maputo",
        commissionBps: 1250,
      },
      {
        ownerUserId: otherOwnerUserId,
        type: "individual",
        name: "Quote Read Other Provider",
        slug: `quote-read-other-${suffix}`,
        status: "active",
        timezone: "Africa/Maputo",
      },
    ])
    .returning({ id: provider.id });
  providerId = providers[0]!.id;
  otherProviderId = providers[1]!.id;

  const members = await db
    .insert(providerMember)
    .values([
      { providerId, userId: ownerUserId, role: "owner" },
      { providerId: otherProviderId, userId: otherOwnerUserId, role: "owner" },
    ])
    .returning({ id: providerMember.id });
  memberId = members[0]!.id;
  otherMemberId = members[1]!.id;

  const [categoryRow] = await db
    .insert(category)
    .values({ code: `quote-read-test-${suffix}`, sortOrder: 999 })
    .returning({ id: category.id });
  categoryId = categoryRow!.id;

  const services = await db
    .insert(service)
    .values([
      { providerId, categoryId, sourceLocale: "pt-MZ", locationType: "at_customer", bookingMode: "quote", status: "published" },
      { providerId, categoryId, sourceLocale: "pt-MZ", locationType: "at_customer", bookingMode: "quote", status: "published" },
      { providerId: otherProviderId, categoryId, sourceLocale: "pt-MZ", locationType: "at_customer", bookingMode: "quote", status: "published" },
    ])
    .returning({ id: service.id });
  serviceId = services[0]!.id;
  secondServiceId = services[1]!.id;
  otherServiceId = services[2]!.id;

  await db.insert(serviceTranslation).values([
    { serviceId, locale: "pt-MZ", name: "Instalação de AC" },
    { serviceId: secondServiceId, locale: "pt-MZ", name: "Manutenção de AC" },
    { serviceId: otherServiceId, locale: "pt-MZ", name: "Pintura" },
  ]);
  await db.insert(serviceMember).values({ serviceId, memberId });

  const threads = await db
    .insert(thread)
    .values([
      { type: "inquiry", customerUserId: customerId, providerId, lastMessageAt: NOW },
      { type: "inquiry", customerUserId: otherCustomerId, providerId: otherProviderId, lastMessageAt: NOW },
      { type: "inquiry", customerUserId: namelessCustomerId, providerId: otherProviderId, lastMessageAt: NOW },
    ])
    .returning({ id: thread.id });
  threadId = threads[0]!.id;
  otherThreadId = threads[1]!.id;
  namelessThreadId = threads[2]!.id;

  // The live pair. Two different services, because
  // `quote_open_per_customer_service_uq` allows one open quote per customer
  // and service — the closed five below can all share the first.
  quoteId = await seedQuote({
    customerId,
    providerId,
    serviceId,
    threadId,
    status: "REQUESTED",
    expiresAt: hoursOut(24),
  });
  proposedQuoteId = await seedQuote({
    customerId,
    providerId,
    serviceId: secondServiceId,
    threadId,
    status: "PROPOSED",
    expiresAt: hoursOut(48),
  });

  // The closed five, one per status, oldest last so `history`'s
  // `created_at desc` has something to order.
  const closedIds: string[] = [];
  for (const [index, status] of CLOSED.entries()) {
    closedIds.push(
      await seedQuote({
        customerId,
        providerId,
        serviceId,
        threadId,
        status,
        expiresAt: null,
        createdAt: new Date(NOW.getTime() - (index + 1) * 3_600_000),
        expiredCause: status === "EXPIRED" ? "provider_did_not_respond" : undefined,
        closedReason: status === "DECLINED" ? "not_available" : undefined,
        closedNote: status === "DECLINED" ? "Estou fora de Maputo essa semana." : undefined,
      }),
    );
  }
  acceptedQuoteId = closedIds[0]!;

  // The second customer's own quote, at the second workspace — so the
  // isolation tests prove the filters exclude the *other* side's rows rather
  // than that the query returns nothing at all.
  otherQuoteId = await seedQuote({
    customerId: otherCustomerId,
    providerId: otherProviderId,
    serviceId: otherServiceId,
    threadId: otherThreadId,
    status: "REQUESTED",
    expiresAt: hoursOut(12),
  });

  // At the *second* workspace, deliberately: workspace A's tab counts are
  // asserted to exact numbers elsewhere in this file, and an extra quote there
  // would make this fix's test rewrite three unrelated assertions.
  namelessQuoteId = await seedQuote({
    customerId: namelessCustomerId,
    providerId: otherProviderId,
    serviceId: otherServiceId,
    threadId: namelessThreadId,
    status: "REQUESTED",
    expiresAt: hoursOut(6),
  });

  const [proposalRow] = await db
    .insert(quoteProposal)
    .values({
      quoteId: proposedQuoteId,
      priceMinor: 450_000,
      currency: "MZN",
      startsAt: hoursOut(72),
      durationMinutes: 120,
      endsAt: hoursOut(74),
      providerMemberId: memberId,
      note: "Inclui material.",
      validUntil: hoursOut(48),
      createdByUserId: ownerUserId,
    })
    .returning({ id: quoteProposal.id });
  proposalId = proposalRow!.id;

  const [attachmentRow] = await db
    .insert(quoteAttachment)
    .values({
      quoteId,
      proposalId: null,
      step: "request",
      storageKey: `quotes/${quoteId}/sala.jpg`,
      fileName: "sala.jpg",
      contentType: "image/jpeg",
      sizeBytes: 12_345,
    })
    .returning({ id: quoteAttachment.id });
  attachmentId = attachmentRow!.id;

  // One finished booking for this customer, so `completedBookingsFor` has
  // something true to count. `quote_id` rather than `service_option_id`,
  // which is what `booking_origin_exactly_one` requires of a booking born
  // from a quote.
  const [bookingRow] = await db
    .insert(booking)
    .values({
      customerId,
      providerId,
      serviceId,
      providerMemberId: memberId,
      serviceOptionId: null,
      quoteId: acceptedQuoteId,
      startsAt: new Date(NOW.getTime() - 30 * 24 * 3_600_000),
      endsAt: new Date(NOW.getTime() - 30 * 24 * 3_600_000 + 2 * 3_600_000),
      status: "COMPLETED",
      priceMinor: 450_000,
      commissionBps: 1_250,
      commissionMinor: 56_250,
      serviceName: "Instalação de AC",
      providerName: "Quote Read Test Provider",
      providerSlug: `quote-read-test-${suffix}`,
      durationMinutes: 120,
    })
    .returning({ id: booking.id });
  bookingId = bookingRow!.id;
});

afterAll(async () => {
  await bestEffortCleanup([
    () => db.delete(booking).where(eq(booking.id, bookingId)),
    // `quote_attachment` and `quote_proposal` both cascade on the quote they
    // belong to — see their schemas — so deleting the quotes takes them.
    () =>
      db
        .delete(quote)
        .where(inArray(quote.customerId, [customerId, otherCustomerId, namelessCustomerId])),
    () => db.delete(thread).where(inArray(thread.id, [threadId, otherThreadId, namelessThreadId])),
    () => db.delete(serviceMember).where(eq(serviceMember.serviceId, serviceId)),
    () =>
      db
        .delete(serviceTranslation)
        .where(inArray(serviceTranslation.serviceId, [serviceId, secondServiceId, otherServiceId])),
    () => db.delete(service).where(inArray(service.id, [serviceId, secondServiceId, otherServiceId])),
    () => db.delete(category).where(eq(category.id, categoryId)),
    () => db.delete(providerMember).where(inArray(providerMember.id, [memberId, otherMemberId])),
    () => db.delete(provider).where(inArray(provider.id, [providerId, otherProviderId])),
    // `profile` cascades on `user`, deleted explicitly first so a failure to
    // remove one is visible here rather than as a stranded user row.
    () =>
      db
        .delete(profile)
        .where(
          inArray(profile.userId, [
            customerId,
            otherCustomerId,
            ownerUserId,
            otherOwnerUserId,
            namelessCustomerId,
          ]),
        ),
    () =>
      db
        .delete(user)
        .where(
          inArray(user.id, [
            customerId,
            otherCustomerId,
            ownerUserId,
            otherOwnerUserId,
            namelessCustomerId,
          ]),
        ),
    () => sql.end({ timeout: 5 }),
  ]);
}, DEV_DB_COLD_START_TIMEOUT_MS);

describe("the quote read repository keeps one person's quotes to themselves", () => {
  // The test this codebase has needed four times. Without `customer_id` in
  // the WHERE, both halves below still pass on a one-customer fixture.
  test("a second customer sees nothing of the first customer's quote", async () => {
    expect(await run(() => repo.findForCustomer(quoteId, otherCustomerId))).toBeNull();

    const theirs = await run(() => repo.listForCustomer(otherCustomerId, "open", 20, 0));
    expect(theirs.map((q) => q.id)).not.toContain(quoteId);
    // And they do see their own — otherwise this passes on a query that
    // returns nothing at all.
    expect(theirs.map((q) => q.id)).toContain(otherQuoteId);
  });

  test("a second workspace sees nothing of the first workspace's quote", async () => {
    expect(await run(() => repo.findForProvider(quoteId, otherProviderId))).toBeNull();

    const theirs = await run(() => repo.listForProvider(otherProviderId, "toAnswer", 20, 0));
    expect(theirs.map((q) => q.id)).not.toContain(quoteId);
    expect(theirs.map((q) => q.id)).toContain(otherQuoteId);
  });

  test("the owner of the quote does reach it from both sides", async () => {
    expect((await run(() => repo.findForCustomer(quoteId, customerId)))?.id).toBe(quoteId);
    expect((await run(() => repo.findForProvider(quoteId, providerId)))?.id).toBe(quoteId);
  });
});

describe("the tabs partition the seven statuses", () => {
  test("the tabs split the seven statuses between them and nothing falls out", async () => {
    const open = await run(() => repo.listForCustomer(customerId, "open", 50, 0));
    const history = await run(() => repo.listForCustomer(customerId, "history", 50, 0));

    const seen = new Set([...open, ...history].map((q) => q.status));
    expect(seen.has("REQUESTED")).toBe(true);
    expect(seen.has("PROPOSED")).toBe(true);
    for (const status of CLOSED) expect(seen.has(status)).toBe(true);
    expect(seen.size).toBe(7);

    // Nothing in two tabs, and nothing in none: seven quotes were seeded and
    // seven are listed, across two tabs that never repeat an id.
    const ids = [...open, ...history].map((q) => q.id);
    expect(new Set(ids).size).toBe(7);

    const counts = await run(() => repo.countsForCustomer(customerId));
    expect(counts).toEqual({ open: 2, history: 5 });
    expect(counts.open + counts.history).toBe(open.length + history.length);
  });

  test("the workspace's three tabs split the same seven, with `waiting` carved out of `open`", async () => {
    const toAnswer = await run(() => repo.listForProvider(providerId, "toAnswer", 50, 0));
    const waiting = await run(() => repo.listForProvider(providerId, "waiting", 50, 0));
    const history = await run(() => repo.listForProvider(providerId, "history", 50, 0));

    expect(toAnswer.map((q) => q.id)).toEqual([quoteId]);
    expect(waiting.map((q) => q.id)).toEqual([proposedQuoteId]);
    expect(history).toHaveLength(5);

    expect(await run(() => repo.countsForProvider(providerId))).toEqual({
      toAnswer: 1,
      waiting: 1,
      history: 5,
    });
  });

  test("the live tabs order by the clock and history by when the quote was raised", async () => {
    const open = await run(() => repo.listForCustomer(customerId, "open", 50, 0));
    // 24h before 48h — the most urgent first, which is what the screen is for.
    expect(open.map((q) => q.id)).toEqual([quoteId, proposedQuoteId]);

    const history = await run(() => repo.listForCustomer(customerId, "history", 50, 0));
    const raised = history.map((q) => q.requestedAt.getTime());
    expect([...raised].sort((a, b) => b - a)).toEqual(raised);
  });

  test("the `limit + 1` probe pages without repeating or dropping a row", async () => {
    const first = await run(() => repo.listForCustomer(customerId, "history", 2, 0));
    const second = await run(() => repo.listForCustomer(customerId, "history", 2, 2));
    expect(first).toHaveLength(2);
    expect(second).toHaveLength(2);
    expect(new Set([...first, ...second].map((q) => q.id)).size).toBe(4);
  });
});

describe("what a row carries", () => {
  test("the joined facts: the service's name in the quote's locale, the workspace, the customer and the file count", async () => {
    const row = await run(() => repo.findForCustomer(quoteId, customerId));
    expect(row).toMatchObject({
      serviceName: "Instalação de AC",
      providerName: "Quote Read Test Provider",
      providerSlug: `quote-read-test-${suffix}`,
      // No accepted document was seeded, so the badge is off — the left join
      // finding nothing must not drop the quote.
      providerVerified: false,
      timezone: "Africa/Maputo",
      customerFirstName: "Ana",
      attachmentCount: 1,
      threadId,
    });
  });

  test("a quote with no files counts zero rather than dropping out of the list", async () => {
    const row = await run(() => repo.findForCustomer(proposedQuoteId, customerId));
    expect(row?.attachmentCount).toBe(0);
  });

  test("the proposals come back oldest first, with the member's name, and the files are grouped by quote", async () => {
    const proposals = await run(() => repo.proposalsFor([quoteId, proposedQuoteId]));
    expect(proposals.get(quoteId)).toBeUndefined();
    const offered = proposals.get(proposedQuoteId) ?? [];
    expect(offered.map((p) => p.id)).toEqual([proposalId]);
    expect(offered[0]).toMatchObject({ memberFirstName: "Carlos", supersededAt: null });

    const attachments = await run(() => repo.attachmentsFor([quoteId, proposedQuoteId]));
    expect((attachments.get(quoteId) ?? []).map((a) => a.id)).toEqual([attachmentId]);
    expect(attachments.get(proposedQuoteId)).toBeUndefined();
  });

  test("an empty id list is not a query", async () => {
    expect(await run(() => repo.proposalsFor([]))).toEqual(new Map());
    expect(await run(() => repo.attachmentsFor([]))).toEqual(new Map());
  });

  test("the proposal form's two facts: this workspace's own rate and who performs the service", async () => {
    const facts = await run(() => repo.providerFormFacts(providerId, serviceId));
    expect(facts.commissionBps).toBe(1250);
    expect(facts.performers).toEqual([{ id: memberId, firstName: "Carlos" }]);

    // The other workspace's service, asked for by this workspace: no
    // performers, never somebody else's staff.
    expect((await run(() => repo.providerFormFacts(providerId, otherServiceId))).performers).toEqual([]);
  });

  test("a customer's completed bookings are counted, and only the completed ones", async () => {
    expect(await run(() => repo.completedBookingsFor(customerId))).toBe(1);
    expect(await run(() => repo.completedBookingsFor(otherCustomerId))).toBe(0);
  });

  test("a customer's own name comes off their profile, and a workspace with nobody on a service has no performers", async () => {
    const row = await run(() => repo.findForCustomer(otherQuoteId, otherCustomerId));
    expect(row?.customerFirstName).toBe("Bea");

    // Workspace B's owner has no profile row at all, and no `service_member`
    // row links them to their own service — so the picker is empty rather
    // than showing a nameless entry. The nameless-customer tests below cover
    // the case this file cares about most.
    const facts = await run(() => repo.providerFormFacts(otherProviderId, otherServiceId));
    expect(facts.performers).toEqual([]);
    expect(otherMemberId).toBeTruthy();
  });
});

describe("the reveal rule is the provider DTO's shape", () => {
  test("the workspace's detail carries the district and the city and no other part of the address", async () => {
    const row = await run(() => repo.findForProvider(quoteId, providerId));
    if (!row) throw new Error("fixture: the workspace cannot read its own quote");

    // The repository does carry the whole address — one row shape serves both
    // audiences, and the customer's own page renders every part of it.
    expect(row.addressLine).toBe("Av. Julius Nyerere 123");
    expect(row.addressDirections).toBe("Portão azul, tocar a campainha");

    const facts = await run(() => repo.providerFormFacts(providerId, row.serviceId));
    const dto = toProviderQuoteDetailDTO(row, [], [], facts, 1);

    expect(dto.addressDistrict).toBe("Sommerschield");
    expect(dto.addressCity).toBe("Maputo");
    // Not "is null" — *absent*. A screen cannot leak a key that is not there,
    // and a nullable field is one `if` away from being filled in.
    const keys = Object.keys(dto);
    expect(keys.filter((k) => /line|label|direction|phone|mail/i.test(k))).toEqual([]);
    expect(JSON.stringify(dto)).not.toContain("Julius Nyerere");
    expect(JSON.stringify(dto)).not.toContain("Portão azul");
  });

  /**
   * Round 1's finding, and it sat inside the rule this whole slice exists to
   * enforce.
   *
   * The repository used to fall back to the local part of the customer's
   * registered address when their profile had no first name — the same
   * fallback it still, correctly, uses for the workspace's own staff. A
   * customer who never filled their name in would therefore have handed the
   * workspace "joao.silva": a real name, and a strong lead toward contacting
   * them directly, which is precisely what withholding the street line, the
   * number and the address itself is meant to prevent. Withholding the
   * address while printing its own local part gives the rule away for
   * nothing.
   *
   * Two assertions, and the second is the one that would have caught it: the
   * placeholder is right *and* the local part appears nowhere in the payload.
   */
  test("a customer who never set a name is 'Cliente' to the workspace, never their address's local part", async () => {
    const row = await run(() => repo.findForProvider(namelessQuoteId, otherProviderId));
    if (!row) throw new Error("fixture: the workspace cannot read the nameless customer's quote");

    // Null out of the repository — the placeholder is the mapper's decision,
    // and the address was never read to be fallen back to.
    expect(row.customerFirstName).toBeNull();

    const dto = toProviderQuoteDetailDTO(row, [], [], { commissionBps: 1000, performers: [] }, 0);
    expect(dto.customerFirstName).toBe("Cliente");
    expect(dto.customerFirstName).not.toContain("joao");
    expect(JSON.stringify(dto)).not.toContain(namelessLocalPart);
  });

  test("the same customer is 'Cliente' through the workspace's list, not only its detail", async () => {
    const rows = await run(() => repo.listForProvider(otherProviderId, "toAnswer", 20, 0));
    const mine = rows.find((q) => q.id === namelessQuoteId);
    if (!mine) throw new Error("fixture: the nameless customer's quote is not in the workspace's list");

    const dto = toProviderQuoteDTO(mine, [], []);
    expect(dto.customerFirstName).toBe("Cliente");
    expect(JSON.stringify(dto)).not.toContain(namelessLocalPart);
  });

  test("a customer who did set a name still gets their own name, not the placeholder", async () => {
    const row = await run(() => repo.findForProvider(quoteId, providerId));
    if (!row) throw new Error("fixture: the workspace cannot read its own quote");
    const dto = toProviderQuoteDTO(row, [], []);
    expect(dto.customerFirstName).toBe("Ana");
  });

  test("the customer's own detail does carry their address in full", async () => {
    const row = await run(() => repo.findForCustomer(quoteId, customerId));
    if (!row) throw new Error("fixture: the customer cannot read their own quote");
    const attachments = await run(() => repo.attachmentsFor([quoteId]));

    const dto = toCustomerQuoteDetailDTO(row, [], attachments.get(quoteId) ?? []);
    expect(dto.address).toEqual({
      label: "Casa",
      line: "Av. Julius Nyerere 123",
      city: "Maputo",
      district: "Sommerschield",
      directions: "Portão azul, tocar a campainha",
    });
    expect(dto.requestAttachments.map((a) => a.fileName)).toEqual(["sala.jpg"]);
  });

  test("the description is cut to a snippet for the card and kept whole for the page", async () => {
    const long = "x".repeat(500);
    const row = await run(() => repo.findForProvider(quoteId, providerId));
    if (!row) throw new Error("fixture: the workspace cannot read its own quote");
    const dto = toProviderQuoteDetailDTO(
      { ...row, description: long },
      [],
      [],
      { commissionBps: 1000, performers: [] },
      0,
    );
    expect(dto.descriptionSnippet).toHaveLength(160);
    expect(dto.description).toHaveLength(500);
  });
});
