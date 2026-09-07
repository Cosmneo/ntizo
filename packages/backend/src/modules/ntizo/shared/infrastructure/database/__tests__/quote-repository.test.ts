/**
 * `DrizzleQuoteRepository` against the real dev database, same reason and
 * same mechanism as `booking-repository.test.ts`: the repository reaches
 * the database through `getDb()`, which resolves through the app's
 * request-scoped AsyncLocalStorage context — and a test has no request.
 * `__runWithTransactionContextForTests` binds this file's own real,
 * `DEV_DB_URL`-backed Drizzle client into that same context for the
 * duration of one test body.
 *
 * Fixtures follow `quote-constraints.test.ts`'s pattern exactly: one
 * provider, one provider member, one category, one service and one thread,
 * created fresh under a random `suffix` in `beforeAll` — `quote.thread_id`
 * is `NOT NULL` and references `thread`, so this file needs that fixture
 * too, unlike `booking-repository.test.ts`.
 *
 * Tests below run in declaration order and share module-level state on
 * purpose — the second test reads the quote the first one inserted, and the
 * third uses `ownerUserId` as its customer precisely so it does not collide
 * with the first test's still-open quote on `quote_open_per_customer_service_uq`,
 * and the fourth closes that first quote, which is why it comes last.
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import * as authSchema from "../../../../../better-auth/infrastructure/database/schema";
import { __runWithTransactionContextForTests } from "../../../../../../shared/infrastructure/database/tx-context";
import { category } from "../catalog/schemas/category.schema";
import { service } from "../catalog/schemas/service.schema";
import { provider } from "../provider/schemas/provider.schema";
import { providerMember } from "../provider/schemas/provider-member.schema";
import { user } from "../user/schemas/user.schema";
import { thread } from "../communication/schemas/thread.schema";
import { quote, quoteProposal } from "../quote/schemas";
import { Quote } from "../../../../bounded-contexts/quote/domain/aggregates/quote.aggregate";
import { QuoteAlreadyOpenError } from "../../../../bounded-contexts/quote/domain/exceptions";
import { DrizzleQuoteRepository } from "../../../../bounded-contexts/quote/infrastructure/repositories/drizzle/quote.repository";
import { bestEffortCleanup, DEV_DB_COLD_START_TIMEOUT_MS, openDevDbConnection } from "./dev-db-test-connection";

setDefaultTimeout(DEV_DB_COLD_START_TIMEOUT_MS);

const sql = openDevDbConnection();
// `{ schema: authSchema }`, not a bare `drizzle(sql)`: `DrizzleDb` (what
// `__runWithTransactionContextForTests` binds into AsyncLocalStorage) is
// typed against this schema shape — same requirement as
// `booking-repository.test.ts`, even though nothing queried here belongs to
// that schema.
const db = drizzle(sql, { schema: authSchema });

const repo = new DrizzleQuoteRepository();
const run = <T>(work: () => Promise<T>) => __runWithTransactionContextForTests(db, work);
const suffix = crypto.randomUUID();

let customerId: string;
let ownerUserId: string;
let providerId: string;
let memberId: string;
let categoryId: string;
let serviceId: string;
let threadId: string;

/** Every quote this file inserts, tracked so `afterAll` deletes exactly what it created. */
const quoteIds: string[] = [];

beforeAll(async () => {
  customerId = crypto.randomUUID();
  ownerUserId = crypto.randomUUID();
  await db.insert(user).values([
    { id: customerId, email: `quote-repo-customer-${suffix}@ntizo.test`, role: "customer", status: "active" },
    { id: ownerUserId, email: `quote-repo-owner-${suffix}@ntizo.test`, role: "customer", status: "active" },
  ]);

  const [p] = await db
    .insert(provider)
    .values({
      ownerUserId,
      type: "individual",
      name: "Quote Repository Test Provider",
      slug: `quote-repo-test-${suffix}`,
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
    .values({ code: `quote-repo-test-${suffix}`, sortOrder: 999 })
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
});

afterAll(async () => {
  await bestEffortCleanup([
    // Scoped to `providerId` rather than `quoteIds`, so a quote this file
    // inserted but never got to track (an assertion that threw partway
    // through a test) is still cleaned up — same reasoning as
    // `booking-repository.test.ts`'s `afterAll`. `quote_proposal` rows
    // cascade off `quote` (see `quote-proposal.schema.ts`), so no separate
    // delete is needed for them.
    () => db.delete(quote).where(eq(quote.providerId, providerId)),
    () => db.delete(thread).where(eq(thread.id, threadId)),
    () => db.delete(service).where(eq(service.id, serviceId)),
    () => db.delete(category).where(eq(category.id, categoryId)),
    () => db.delete(providerMember).where(eq(providerMember.id, memberId)),
    () => db.delete(provider).where(eq(provider.id, providerId)),
    () => db.delete(user).where(eq(user.id, customerId)),
    () => db.delete(user).where(eq(user.id, ownerUserId)),
    () => sql.end({ timeout: 5 }),
  ]);
}, DEV_DB_COLD_START_TIMEOUT_MS);

describe("DrizzleQuoteRepository", () => {
  test("insert then findById round-trips the request; a second open request on the service is refused", async () => {
    const q = Quote.request({
      serviceId,
      providerId,
      customerId,
      threadId,
      locale: "pt-MZ",
      description: "Dois aparelhos split",
      neededBy: "2026-09-27",
      address: {
        label: "Casa",
        line: "Av. X 1",
        city: "Maputo",
        district: "Central",
        directions: null,
        lat: -25.96,
        lng: 32.58,
      },
      at: new Date(),
      respondBy: new Date(Date.now() + 48 * 3_600_000),
    });
    const saved = await run(() => repo.insert(q));
    expect(saved.id).toBeString();
    const found = await run(() => repo.findById(saved.id as string));
    expect(found?.description).toBe("Dois aparelhos split");
    expect(found?.addressLat).toBe(-25.96);
    expect(found?.proposals).toEqual([]);
    await expect(run(() => repo.insert(q))).rejects.toThrow(QuoteAlreadyOpenError);
    quoteIds.push(saved.id as string);
  });

  test("save inserts a new proposal, stamps the superseded one, and refuses when the status moved on", async () => {
    const found = (await run(() => repo.findById(quoteIds[0]!)))!;
    const startsAt = new Date(Date.now() + 7 * 24 * 3_600_000);
    const propose = (q: Quote, price: number, at: Date) =>
      q.propose({
        priceMinor: price,
        currency: "MZN",
        startsAt,
        durationMinutes: 240,
        providerMemberId: memberId,
        validUntil: new Date(at.getTime() + 72 * 3_600_000),
        createdByUserId: ownerUserId,
        at,
        minPriceMinor: 5_000,
      });
    const first = await run(() => repo.save(propose(found, 10_600, new Date()), "REQUESTED"));
    expect(first?.liveProposal?.id).toBeString();
    const second = await run(() => repo.save(propose(first!, 9_800, new Date(Date.now() + 1000)), "PROPOSED"));
    expect(second?.proposals).toHaveLength(2);
    expect(second?.proposals[0]?.supersededCause).toBe("revised");
    expect(second?.liveProposal?.priceMinor).toBe(9_800);
    const stale = await run(() => repo.save(second!.decline(new Date(), ownerUserId, "other", null), "REQUESTED"));
    expect(stale).toBeNull();
  });

  test("findDueForSweep returns only open quotes past their clock", async () => {
    const q = Quote.request({
      serviceId,
      providerId,
      customerId: ownerUserId,
      threadId,
      locale: "pt-MZ",
      description: "x",
      at: new Date(Date.now() - 2 * 3_600_000),
      respondBy: new Date(Date.now() - 3_600_000),
    });
    const saved = await run(() => repo.insert(q));
    quoteIds.push(saved.id as string);
    const due = await run(() => repo.findDueForSweep(new Date(), 50));
    expect(due.map((d) => d.id)).toContain(saved.id);
    expect(due.map((d) => d.id)).not.toContain(quoteIds[0]);
  });

  /**
   * The race the quote's own compare-and-swap cannot see. A revision is
   * `PROPOSED → PROPOSED`, so `eq(quote.status, expectedStatus)` still
   * matches for a command that loaded the quote *before* that revision: it
   * wins its swap and then walks its stale proposal list, where the retired
   * proposal is still live. Unguarded, the proposal UPDATE writes
   * `superseded_at = null` back over the row the revision had just retired,
   * and two live proposals collide on `quote_proposal_live_uq` as a raw
   * 23505 that nothing maps — reaching the client as `INTERNAL_ERROR`,
   * which the spec forbids outright.
   *
   * Runs last on purpose: it accepts `quoteIds[0]`, and the tests above read
   * that quote while it is still open.
   */
  test("a save from a stale snapshot cannot resurrect a proposal a revision retired", async () => {
    const quoteId = quoteIds[0]!;
    // The snapshot the losing command loaded, before anything else happened.
    const stale = (await run(() => repo.findById(quoteId)))!;
    const staleLiveId = stale.liveProposal!.id!;
    expect(staleLiveId).toBeString();

    // The revision lands first, superseding that proposal and inserting its
    // own. The quote's status does not move.
    const revisedAt = new Date();
    const revised = await run(() =>
      repo.save(
        stale.propose({
          priceMinor: 8_700,
          currency: "MZN",
          startsAt: new Date(Date.now() + 8 * 24 * 3_600_000),
          durationMinutes: 240,
          providerMemberId: memberId,
          validUntil: new Date(revisedAt.getTime() + 72 * 3_600_000),
          createdByUserId: ownerUserId,
          at: revisedAt,
          minPriceMinor: 5_000,
        }),
        "PROPOSED",
      ),
    );
    expect(revised?.liveProposal?.priceMinor).toBe(8_700);

    // The losing command, still holding the pre-revision aggregate, saves.
    // Its swap succeeds — the status really is still `PROPOSED` — so the
    // proposal loop runs with the retired proposal marked live in its own
    // snapshot. Nothing may throw here: before the guard this line raised
    // the unmapped 23505.
    const persisted = await run(() => repo.save(stale.accept(new Date(), crypto.randomUUID()), "PROPOSED"));
    expect(persisted).not.toBeNull();

    const rows = await db.select().from(quoteProposal).where(eq(quoteProposal.quoteId, quoteId));
    const older = rows.find((r) => r.id === staleLiveId)!;
    expect(older.supersededAt).not.toBeNull();
    expect(older.supersededCause).toBe("revised");

    const live = rows.filter((r) => r.supersededAt === null);
    expect(live).toHaveLength(1);
    expect(live[0]?.priceMinor).toBe(8_700);
    // And the aggregate handed back reports the database, not the caller's
    // snapshot of it.
    expect(persisted?.liveProposal?.priceMinor).toBe(8_700);
  });
});
