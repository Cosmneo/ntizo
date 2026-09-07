/**
 * `DrizzleQuoteAttachmentRepository` against the real dev database.
 *
 * Closes a gap the review of this repository raised fourteen tasks before
 * this file, in Task 4's own plan review, and deferred to the download
 * route (Task 18): `findVisible` is the only thing stopping one signed-in
 * user from reading another party's quote files, and until now that has
 * been verified by reading the join, never by a test that runs it. A test
 * with only one user passes whether or not the check exists — the tests
 * below use three DISTINCT, genuinely registered users (the quote's
 * customer, a member of its provider, and an unrelated signed-in third
 * party) for exactly that reason. See `findVisible`'s own `describe` below.
 *
 * Same reason and mechanism as `quote-repository.test.ts`: the repository
 * reaches the database through `getDb()`, which resolves through the app's
 * request-scoped AsyncLocalStorage context — and a test has no request.
 * `__runWithTransactionContextForTests` binds this file's own real,
 * `DEV_DB_URL`-backed Drizzle client into that same context for the
 * duration of one test body.
 *
 * Fixtures follow `quote-repository.test.ts`'s pattern: one provider, one
 * provider member, one category, one service, one thread, one quote — plus,
 * new here, a third real user who belongs to none of them (`strangerId`).
 * That id is a genuinely inserted `user` row, not a fabricated one: see
 * `communication/__tests__/repositories.test.ts`'s own `findVisible`
 * describe for why a fabricated stranger id cannot tell a working
 * visibility check apart from one that silently filters on nothing more
 * than "does this id exist in `user`".
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
import { quote, quoteAttachment } from "../quote/schemas";
import { DrizzleQuoteAttachmentRepository } from "../../../../bounded-contexts/quote/infrastructure/repositories/drizzle/quote-attachment.repository";
import { bestEffortCleanup, DEV_DB_COLD_START_TIMEOUT_MS, openDevDbConnection } from "./dev-db-test-connection";

setDefaultTimeout(DEV_DB_COLD_START_TIMEOUT_MS);

const sql = openDevDbConnection();
// `{ schema: authSchema }`, not a bare `drizzle(sql)`: `DrizzleDb` (what
// `__runWithTransactionContextForTests` binds into AsyncLocalStorage) is
// typed against this schema shape — same requirement as
// `quote-repository.test.ts`, even though nothing queried here belongs to
// that schema.
const db = drizzle(sql, { schema: authSchema });

const repo = new DrizzleQuoteAttachmentRepository();
const run = <T>(work: () => Promise<T>) => __runWithTransactionContextForTests(db, work);
const suffix = crypto.randomUUID();

let customerId: string;
let ownerUserId: string;
/** Signed in, real, and a party to nothing this file creates — the third of the three users the carried-forward requirement asks for. */
let strangerId: string;
let providerId: string;
let memberId: string;
let categoryId: string;
let serviceId: string;
let threadId: string;
let quoteId: string;
let attachmentId: string;

beforeAll(async () => {
  customerId = crypto.randomUUID();
  ownerUserId = crypto.randomUUID();
  strangerId = crypto.randomUUID();
  await db.insert(user).values([
    { id: customerId, email: `quote-attachment-customer-${suffix}@ntizo.test`, role: "customer", status: "active" },
    { id: ownerUserId, email: `quote-attachment-owner-${suffix}@ntizo.test`, role: "customer", status: "active" },
    { id: strangerId, email: `quote-attachment-stranger-${suffix}@ntizo.test`, role: "customer", status: "active" },
  ]);

  const [p] = await db
    .insert(provider)
    .values({
      ownerUserId,
      type: "individual",
      name: "Quote Attachment Repository Test Provider",
      slug: `quote-attachment-repo-test-${suffix}`,
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
    .values({ code: `quote-attachment-repo-test-${suffix}`, sortOrder: 999 })
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

  const [q] = await db
    .insert(quote)
    .values({
      serviceId,
      providerId,
      customerId,
      threadId,
      status: "REQUESTED",
      locale: "pt-MZ",
      description: "Uma torneira a pingar na cozinha",
      requestedAt: new Date(),
      expiresAt: new Date(Date.now() + 3_600_000),
    })
    .returning({ id: quote.id });
  quoteId = q!.id;

  await run(() =>
    repo.insertMany([
      {
        quoteId,
        proposalId: null,
        step: "request",
        storageKey: `attachment/${customerId}/quote-attachment-repo-test-${suffix}.jpg`,
        fileName: "torneira.jpg",
        contentType: "image/jpeg",
        sizeBytes: 12_345,
      },
    ]),
  );

  const [row] = await db
    .select({ id: quoteAttachment.id })
    .from(quoteAttachment)
    .where(eq(quoteAttachment.quoteId, quoteId));
  attachmentId = row!.id;
}, DEV_DB_COLD_START_TIMEOUT_MS);

afterAll(async () => {
  await bestEffortCleanup([
    // `quote_attachment` references `quote.id` with `ON DELETE CASCADE` —
    // deleting the quote already removes the attachment row this file wrote.
    () => db.delete(quote).where(eq(quote.id, quoteId)),
    () => db.delete(thread).where(eq(thread.id, threadId)),
    () => db.delete(service).where(eq(service.id, serviceId)),
    () => db.delete(category).where(eq(category.id, categoryId)),
    () => db.delete(providerMember).where(eq(providerMember.id, memberId)),
    () => db.delete(provider).where(eq(provider.id, providerId)),
    () => db.delete(user).where(eq(user.id, customerId)),
    () => db.delete(user).where(eq(user.id, ownerUserId)),
    () => db.delete(user).where(eq(user.id, strangerId)),
    () => sql.end({ timeout: 5 }),
  ]);
}, DEV_DB_COLD_START_TIMEOUT_MS);

describe("DrizzleQuoteAttachmentRepository", () => {
  test("insertMany writes the row, retrievable by its quote", async () => {
    const rows = await db.select().from(quoteAttachment).where(eq(quoteAttachment.quoteId, quoteId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.fileName).toBe("torneira.jpg");
    expect(rows[0]?.step).toBe("request");
    expect(rows[0]?.proposalId).toBeNull();
  });

  describe("findVisible", () => {
    test("the quote's customer reads the attachment", async () => {
      await run(async () => {
        const row = await repo.findVisible(attachmentId, customerId);
        expect(row?.id).toBe(attachmentId);
        expect(row?.fileName).toBe("torneira.jpg");
      });
    });

    test("a member of the quote's provider reads it too — resolved through provider_member, not ownership alone", async () => {
      await run(async () => {
        const row = await repo.findVisible(attachmentId, ownerUserId);
        expect(row?.id).toBe(attachmentId);
      });
    });

    /**
     * The carried-forward requirement itself. `strangerId` is signed in
     * (a real, registered `user` row from `beforeAll`) and party to none of
     * this fixture — no `provider_member` row, not the quote's customer.
     * The refusal it gets must be indistinguishable from the refusal a
     * completely nonexistent attachment id gets: both come back `null`, so a
     * caller probing ids by watching for a different answer learns nothing.
     */
    test("an unrelated signed-in user is refused — identically to an attachment that does not exist", async () => {
      await run(async () => {
        const strangerResult = await repo.findVisible(attachmentId, strangerId);
        const missingResult = await repo.findVisible(crypto.randomUUID(), customerId);
        expect(strangerResult).toBeNull();
        expect(missingResult).toBeNull();
        expect(strangerResult).toEqual(missingResult);
      });
    });
  });

  describe("findAny", () => {
    test("returns the row for any caller — the administrator fallback the download route uses once findVisible has already refused", async () => {
      await run(async () => {
        expect(await repo.findVisible(attachmentId, strangerId)).toBeNull();
        const row = await repo.findAny(attachmentId);
        expect(row?.id).toBe(attachmentId);
      });
    });

    test("returns null for an id that does not exist", async () => {
      await run(async () => {
        expect(await repo.findAny(crypto.randomUUID())).toBeNull();
      });
    });
  });
});
