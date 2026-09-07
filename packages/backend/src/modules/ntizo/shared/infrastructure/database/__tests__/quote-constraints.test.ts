/**
 * These assert against the real dev database rather than mocking Drizzle —
 * see `booking-constraints.test.ts`'s own header for the full argument. Only
 * inserting the row Postgres must refuse, and reading a constraint's own
 * definition back from Postgres's catalogs, proves the constraint is really
 * there.
 *
 * Connects the same way: `postgres` + `drizzle-orm/postgres-js` against
 * `DEV_DB_URL`, which Bun loads automatically from `packages/backend/.env`.
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { QUOTE_STATUSES } from "@ntizo/shared";
import { category } from "../catalog/schemas/category.schema";
import { service } from "../catalog/schemas/service.schema";
import { provider } from "../provider/schemas/provider.schema";
import { providerMember } from "../provider/schemas/provider-member.schema";
import { user } from "../user/schemas/user.schema";
import { thread } from "../communication/schemas/thread.schema";
import { booking } from "../booking/schemas/booking.schema";
import { quote, quoteProposal } from "../quote/schemas";
import { QUOTE_DEADLINE_BEARING_STATUSES, QUOTE_STATUS_VALUES } from "../quote/enums";
import { bestEffortCleanup, DEV_DB_COLD_START_TIMEOUT_MS, openDevDbConnection } from "./dev-db-test-connection";

setDefaultTimeout(DEV_DB_COLD_START_TIMEOUT_MS);

const sql = openDevDbConnection();
const db = drizzle(sql);
const suffix = crypto.randomUUID();

let customerId: string;
let ownerUserId: string;
let providerId: string;
let memberId: string;
let categoryId: string;
let serviceId: string;
let threadId: string;

beforeAll(async () => {
  customerId = crypto.randomUUID();
  ownerUserId = crypto.randomUUID();
  await db.insert(user).values([
    { id: customerId, email: `quote-customer-${suffix}@ntizo.test`, role: "customer", status: "active" },
    { id: ownerUserId, email: `quote-owner-${suffix}@ntizo.test`, role: "customer", status: "active" },
  ]);
  const [p] = await db
    .insert(provider)
    .values({ ownerUserId, type: "individual", name: "Quote Constraint Provider", slug: `quote-constraint-${suffix}`, status: "active" })
    .returning({ id: provider.id });
  providerId = p!.id;
  const [m] = await db
    .insert(providerMember)
    .values({ providerId, userId: ownerUserId, role: "owner" })
    .returning({ id: providerMember.id });
  memberId = m!.id;
  const [c] = await db
    .insert(category)
    .values({ code: `quote-cat-${suffix}`, sortOrder: 999 })
    .returning({ id: category.id });
  categoryId = c!.id;
  const [s] = await db
    .insert(service)
    .values({ providerId, categoryId, sourceLocale: "pt-MZ", locationType: "at_customer", bookingMode: "quote", status: "published" })
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
    () => db.delete(quote).where(eq(quote.customerId, customerId)),
    () => db.delete(thread).where(eq(thread.id, threadId)),
    () => db.delete(service).where(eq(service.id, serviceId)),
    () => db.delete(category).where(eq(category.id, categoryId)),
    () => db.delete(providerMember).where(eq(providerMember.id, memberId)),
    () => db.delete(provider).where(eq(provider.id, providerId)),
    () => db.delete(user).where(eq(user.id, customerId)),
    () => db.delete(user).where(eq(user.id, ownerUserId)),
    () => sql.end(),
  ]);
});

function openQuote(status: "REQUESTED" | "PROPOSED" | "DECLINED") {
  return {
    serviceId, providerId, customerId, threadId, status, locale: "pt-MZ",
    description: "Dois aparelhos split", requestedAt: new Date(),
    expiresAt: status === "DECLINED" ? null : new Date(Date.now() + 3_600_000),
  };
}

// Drizzle's query builders are lazy thenables, not native Promises —
// `expect(...).rejects` needs a real Promise, which wrapping in an async
// function guarantees: awaiting a thenable inside one always produces a
// genuine Promise on the outside. Same technique as
// booking-constraints.test.ts's `insertBooking`.
async function insertQuoteRow(values: typeof quote.$inferInsert) {
  return await db.insert(quote).values(values).returning({ id: quote.id });
}

async function insertProposalRow(values: typeof quoteProposal.$inferInsert) {
  return await db.insert(quoteProposal).values(values);
}

async function insertBookingRow(values: typeof booking.$inferInsert) {
  return await db.insert(booking).values(values).returning({ id: booking.id });
}

describe("ntizo_quote constraints", () => {
  test("a customer cannot hold two open quotes on one service, but may after the first closes", async () => {
    const [first] = await insertQuoteRow(openQuote("REQUESTED"));
    await expect(insertQuoteRow(openQuote("PROPOSED"))).rejects.toThrow(/quote_open_per_customer_service_uq/);
    const [closed] = await insertQuoteRow(openQuote("DECLINED"));
    expect(closed?.id).toBeString();
    await db.delete(quote).where(eq(quote.id, first!.id));
  });

  test("a quote carries at most one live proposal", async () => {
    const [q] = await insertQuoteRow(openQuote("PROPOSED"));
    const startsAt = new Date(Date.now() + 7 * 24 * 3_600_000);
    const base = {
      quoteId: q!.id, priceMinor: 9_800, startsAt, durationMinutes: 240,
      endsAt: new Date(startsAt.getTime() + 240 * 60_000), providerMemberId: memberId,
      validUntil: new Date(Date.now() + 72 * 3_600_000), createdByUserId: ownerUserId,
    };
    await insertProposalRow(base);
    await expect(insertProposalRow(base)).rejects.toThrow(/quote_proposal_live_uq/);
    await insertProposalRow({ ...base, supersededAt: new Date(), supersededCause: "revised" });
    await db.delete(quote).where(eq(quote.id, q!.id));
  });

  test("a booking names exactly one origin", async () => {
    const [q] = await insertQuoteRow(openQuote("DECLINED"));
    const startsAt = new Date(Date.now() + 8 * 24 * 3_600_000);
    const row = {
      customerId, providerId, serviceId, providerMemberId: memberId, startsAt,
      endsAt: new Date(startsAt.getTime() + 60 * 60_000), status: "DECLINED", priceMinor: 1000,
      commissionBps: 1000, commissionMinor: 100, serviceName: "S", providerName: "P", providerSlug: "p",
      durationMinutes: 60,
    };
    await expect(
      insertBookingRow({ ...row, serviceOptionId: null, quoteId: null }),
    ).rejects.toThrow(/booking_origin_exactly_one/);
    const [b] = await insertBookingRow({ ...row, serviceOptionId: null, quoteId: q!.id });
    expect(b?.id).toBeString();
    await db.delete(booking).where(eq(booking.id, b!.id));
    await db.delete(quote).where(eq(quote.id, q!.id));
  });

  test("the sweep index is partial on exactly the deadline-bearing statuses", async () => {
    const rows = await sql`
      SELECT indexdef FROM pg_indexes
      WHERE schemaname = 'ntizo_quote' AND tablename = 'quote' AND indexname = 'quote_sweep_idx'`;
    const definition = rows[0]?.["indexdef"] as string | undefined;
    expect(definition).toBeDefined();
    expect(definition).toContain("expires_at");
    for (const status of QUOTE_DEADLINE_BEARING_STATUSES) expect(definition).toContain(status);
    for (const status of QUOTE_STATUS_VALUES) {
      if (!(QUOTE_DEADLINE_BEARING_STATUSES as readonly string[]).includes(status)) {
        expect(definition).not.toContain(status);
      }
    }
  });

  // The wire enum in `packages/shared` and the column's CHECK cannot import
  // each other — one is read at build time by every frontend and by this
  // backend, the other is baked into a migration file — so this is the only
  // guard against the two lists of the same seven statuses drifting apart.
  test("the shared status list and the database's are the same set", () => {
    expect([...QUOTE_STATUS_VALUES].sort()).toEqual([...QUOTE_STATUSES].sort());
  });
});
