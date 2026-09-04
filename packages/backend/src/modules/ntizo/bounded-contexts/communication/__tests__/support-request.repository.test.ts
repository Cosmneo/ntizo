import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as authSchema from "../../../../better-auth/infrastructure/database/schema";
import { __runWithTransactionContextForTests } from "../../../../../shared/infrastructure/database/tx-context";
import { supportRequest, thread } from "../../../shared/infrastructure/database/communication/schemas";
import type { SupportKind } from "../../../shared/infrastructure/database/communication/enums";
import { user } from "../../../shared/infrastructure/database/user/schemas";
import { provider, providerMember } from "../../../shared/infrastructure/database/provider/schemas";
import { CursorInvalidError } from "../domain/exceptions";
import { SupportRequest } from "../domain/aggregates/support-request.aggregate";
import { Message } from "../domain/aggregates/message.aggregate";
import { DrizzleThreadRepository } from "../infrastructure/repositories/drizzle/thread.repository";
import { DrizzleMessageRepository } from "../infrastructure/repositories/drizzle/message.repository";
import { DrizzleSupportRequestRepository } from "../infrastructure/repositories/drizzle/support-request.repository";

const url = process.env["DEV_DB_URL"];
if (!url) throw new Error("DEV_DB_URL is not set — see packages/backend/.env");

// A live, serverless (Neon) instance, not a local one — see
// repositories.test.ts for why the default 5000ms is raised here.
setDefaultTimeout(20_000);

const sql = postgres(url, { max: 1 });
// `{ schema: authSchema }`, not a bare `drizzle(sql)`: `DrizzleDb` (what
// `__runWithTransactionContextForTests` binds into AsyncLocalStorage) is
// typed against this schema shape. Same requirement as `repositories.test.ts`.
const db = drizzle(sql, { schema: authSchema });
const threads = new DrizzleThreadRepository();
const messages = new DrizzleMessageRepository();
const requests = new DrizzleSupportRequestRepository();
const NOW = new Date("2026-09-02T10:00:00.000Z");

const run = <T>(fn: () => Promise<T>) => __runWithTransactionContextForTests(db, fn);

const suffix = crypto.randomUUID();
const userIds: string[] = [];

function newUser(): string {
  const id = crypto.randomUUID();
  userIds.push(id);
  return id;
}

async function makeProvider(ownerUserId: string, label: string): Promise<string> {
  const [row] = await db
    .insert(provider)
    .values({
      ownerUserId,
      type: "organization",
      name: `Support Request Repo Test ${label}`,
      slug: `support-request-repo-test-${label}-${suffix}`,
      status: "active",
    })
    .returning({ id: provider.id });
  const id = row!.id;
  return id;
}

let customerId: string;
let memberId: string;
let adminId: string;
let providerId: string;
const threadIds: string[] = [];

async function openPersonal(subject: string, at = NOW, kind?: SupportKind): Promise<string> {
  return run(async () => {
    const id = await threads.openSupport(customerId, null, at);
    threadIds.push(id);
    await requests.insert(SupportRequest.open({ threadId: id, audience: "customer", subject, bookingId: null, kind, now: at }));
    await messages.insert(Message.compose({ threadId: id, senderUserId: customerId, senderSide: "customer", body: subject, now: at }));
    return id;
  });
}

async function openForProvider(subject: string, at = NOW): Promise<string> {
  return run(async () => {
    const id = await threads.openSupport(memberId, providerId, at);
    threadIds.push(id);
    await requests.insert(SupportRequest.open({ threadId: id, audience: "provider", subject, bookingId: null, now: at }));
    await messages.insert(Message.compose({ threadId: id, senderUserId: memberId, senderSide: "provider", body: subject, now: at }));
    return id;
  });
}

beforeAll(async () => {
  customerId = newUser();
  memberId = newUser();
  adminId = newUser();
  await db.insert(user).values([
    { id: customerId, email: `sr-c-${suffix}@ntizo.test`, role: "customer", status: "active" },
    { id: memberId, email: `sr-m-${suffix}@ntizo.test`, role: "customer", status: "active" },
    { id: adminId, email: `sr-a-${suffix}@ntizo.test`, role: "admin", status: "active" },
  ]);
  providerId = await makeProvider(memberId, "sr");
  await db.insert(providerMember).values({ providerId, userId: memberId, role: "owner" });
}, 20_000);

afterAll(async () => {
  // Threads cascade to support_request and message.
  if (threadIds.length > 0) await db.delete(thread).where(inArray(thread.id, threadIds));
  await db.delete(providerMember).where(eq(providerMember.providerId, providerId));
  await db.delete(provider).where(eq(provider.id, providerId));
  await db.delete(user).where(inArray(user.id, userIds));
  await sql.end();
}, 20_000);

describe("open and find", () => {
  test("a personal request round-trips, and an inquiry id is not a support request", async () => {
    const id = await openPersonal("Reembolso");
    const found = await run(() => requests.findByThreadId(id));
    expect(found?.subject).toBe("Reembolso");
    expect(found?.status).toBe("open");
    expect(found?.audience).toBe("customer");

    const t = await run(() => threads.findSupportThread(id));
    expect(t?.type).toBe("support");
    expect(t?.providerId).toBeNull();

    // An inquiry thread must be invisible to every support-scoped read.
    const inquiryId = await run(async () => (await threads.openOrFind(customerId, providerId, NOW)).id);
    threadIds.push(inquiryId);
    expect(await run(() => threads.findSupportThread(inquiryId))).toBeNull();
    expect(await run(() => requests.findByThreadId(inquiryId))).toBeNull();
    expect(await run(() => requests.findListItem(inquiryId))).toBeNull();
  });

  // The column Task 2 added and this task first writes. Both directions
  // matter: a request opened as a dispute has to come back a dispute — a
  // repository that inserted the column and forgot to read it would leave
  // every stored dispute looking like an ordinary request the moment it is
  // loaded, and an administrator resolving it would stop moving the booking.
  test("a dispute round-trips as a dispute, and an ordinary request as support", async () => {
    const disputeId = await openPersonal("Avaria eléctrica urgente", NOW, "dispute");
    const supportId = await openPersonal("Reembolso");

    expect((await run(() => requests.findByThreadId(disputeId)))?.kind).toBe("dispute");
    expect((await run(() => requests.findByThreadId(supportId)))?.kind).toBe("support");

    // And through the batched read too, which rehydrates by a different call
    // path than `findByThreadId` appears to — it is the one that actually
    // maps the row.
    const byId = await run(() => requests.findByThreadIds([disputeId, supportId]));
    expect(byId.get(disputeId)?.kind).toBe("dispute");
    expect(byId.get(supportId)?.kind).toBe("support");
  });

  /**
   * The check constraint itself, against the real database.
   *
   * `SupportKind` stops a third value from being *written by this codebase*,
   * and stops nothing else: a migration, a manual `UPDATE`, or a future
   * caller that casts around the union all reach this column with TypeScript
   * out of the room. Note that the insert below needs no cast at all — the
   * column is a `varchar`, so Drizzle types it as a bare `string` and
   * `"nonsense"` type-checks perfectly. `support_request_kind_known` is the
   * only thing between that and a row nothing downstream can interpret, and
   * this is the test that proves it is actually on the database rather than
   * only in `support-request.schema.ts`.
   */
  test("the database refuses a kind that is neither support nor dispute", async () => {
    const threadId = await run(() => threads.openSupport(customerId, null, NOW));
    threadIds.push(threadId);

    // Awaited inside an async function rather than handed to `rejects`
    // directly: Drizzle's insert builder is a thenable, not a `Promise`, and
    // `expect(...).rejects` wants the real thing.
    const insertUnknownKind = async () =>
      await db.insert(supportRequest).values({
        threadId,
        audience: "customer",
        subject: "Nem uma coisa nem outra",
        bookingId: null,
        kind: "nonsense",
        status: "open",
        createdAt: NOW,
      });

    await expect(insertUnknownKind()).rejects.toThrow(/support_request_kind_known/);

    // Refused outright, not coerced to the column's default: nothing was
    // written for this thread at all.
    expect(await run(() => requests.findByThreadId(threadId))).toBeNull();
  });

  test("save persists a resolution, and findByThreadIds batches", async () => {
    const a = await openPersonal("A");
    const b = await openPersonal("B");
    const resolved = (await run(() => requests.findByThreadId(a)))!.resolve(adminId, NOW);
    await run(() => requests.save(resolved));

    const byId = await run(() => requests.findByThreadIds([a, b, crypto.randomUUID()]));
    expect(byId.get(a)?.status).toBe("resolved");
    expect(byId.get(a)?.resolvedByUserId).toBe(adminId);
    expect(byId.get(b)?.status).toBe("open");
    expect(byId.size).toBe(2);
  });
});

describe("the open-request cap", () => {
  test("counts a person's own personal requests, and a provider's requests whoever opened them", async () => {
    const personalBefore = await run(() => requests.countOpenForRequester(customerId, null));
    const providerBefore = await run(() => requests.countOpenForRequester(memberId, providerId));
    await openPersonal("cap-1");
    await openForProvider("cap-2");
    expect(await run(() => requests.countOpenForRequester(customerId, null))).toBe(personalBefore + 1);
    expect(await run(() => requests.countOpenForRequester(memberId, providerId))).toBe(providerBefore + 1);
    // The member's PERSONAL count is unaffected by the provider request they opened.
    expect(await run(() => requests.countOpenForRequester(memberId, null))).toBe(0);
  });
});

describe("inboxes by side", () => {
  test("listForCustomer hides a provider request from the member who opened it; listForProvider shows it", async () => {
    const id = await openForProvider("Comissão");
    const personal = await run(() => threads.listForCustomer(memberId, 50, null));
    expect(personal.items.map((t) => t.id)).not.toContain(id);
    const providers = await run(() => threads.listForProvider(providerId, 50, null, "support"));
    expect(providers.items.map((t) => t.id)).toContain(id);
    const inquiriesOnly = await run(() => threads.listForProvider(providerId, 50, null, "inquiry"));
    expect(inquiriesOnly.items.map((t) => t.id)).not.toContain(id);
  });

  test("listForCustomer(type: 'support') returns only support", async () => {
    const id = await openPersonal("Só suporte");
    const page = await run(() => threads.listForCustomer(customerId, 50, null, "support"));
    expect(page.items.map((t) => t.id)).toContain(id);
    expect(page.items.every((t) => t.type === "support")).toBe(true);
  });
});

describe("unread, by side", () => {
  test("a teammate's message is not unread for another member; a platform reply is", async () => {
    const id = await openForProvider("Equipa");
    const teammateId = newUser();
    await db.insert(user).values({ id: teammateId, email: `sr-t-${suffix}@ntizo.test`, role: "customer", status: "active" });
    await db.insert(providerMember).values({ providerId, userId: teammateId, role: "staff" });

    // The opener's first message: not unread for the teammate (same side).
    expect((await run(() => messages.countUnreadForViewer([id], teammateId))).get(id)).toBeUndefined();
    // …but unread for the platform.
    expect((await run(() => messages.countUnreadForPlatform([id]))).get(id)).toBe(1);

    await run(() => messages.insert(Message.compose({ threadId: id, senderUserId: adminId, senderSide: "platform", body: "Olá", now: NOW })));
    expect((await run(() => messages.countUnreadForViewer([id], teammateId))).get(id)).toBe(1);
    expect((await run(() => messages.countUnreadForViewer([id], memberId))).get(id)).toBe(1);

    // The platform reading marks only the requester side's messages.
    expect(await run(() => messages.markReadForPlatform(id, NOW))).toBe(1);
    expect((await run(() => messages.countUnreadForPlatform([id]))).get(id)).toBeUndefined();
    // A member reading marks the platform reply.
    expect(await run(() => messages.markReadForViewer(id, teammateId, NOW))).toBe(1);
    expect((await run(() => messages.countUnreadForViewer([id], memberId))).get(id)).toBeUndefined();
  });

  test("on a personal request the customer sees a platform reply as unread and nothing else", async () => {
    const id = await openPersonal("Pessoal");
    expect((await run(() => messages.countUnreadForViewer([id], customerId))).get(id)).toBeUndefined();
    await run(() => messages.insert(Message.compose({ threadId: id, senderUserId: adminId, senderSide: "platform", body: "Resposta", now: NOW })));
    expect((await run(() => messages.countUnreadForViewer([id], customerId))).get(id)).toBe(1);
  });
});

describe("the sweep's claim", () => {
  test("carries the thread type, the side, and the subject", async () => {
    const id = await openPersonal("Claim");
    const due = await run(() => messages.claimDueForNotice(500, new Date(NOW.getTime() + 10 * 60_000)));
    const mine = due.find((m) => m.threadId === id);
    expect(mine).toMatchObject({ threadType: "support", senderSide: "customer", customerUserId: customerId, providerId: null, subject: "Claim" });
  });
});

describe("the admin queue", () => {
  test("filters by status and audience, orders by last message, and pages", async () => {
    const older = await openForProvider("Old", new Date("2026-09-01T09:00:00.000Z"));
    const newer = await openPersonal("New", new Date("2026-09-01T10:00:00.000Z"));
    const resolvedId = await openPersonal("Done", new Date("2026-09-01T11:00:00.000Z"));
    await run(async () => requests.save((await requests.findByThreadId(resolvedId))!.resolve(adminId, NOW)));

    // The admin queue is shared with a running application: a page can
    // legitimately carry rows this test never created. Every assertion below
    // filters a page down to this file's own fixtures — by `requesterUserId`,
    // which is `customerId` for a personal request and `memberId` for one
    // opened for the provider — before asserting membership or order, so a
    // real request sorted alongside these never becomes part of the claim.
    const isOwnFixture = (item: { requesterUserId: string }) =>
      item.requesterUserId === customerId || item.requesterUserId === memberId;

    const open = await run(() => requests.listForAdmin({ status: "open" }, 500, null));
    const ids = open.items.filter(isOwnFixture).map((i) => i.threadId);
    expect(ids).toContain(older);
    expect(ids).toContain(newer);
    expect(ids).not.toContain(resolvedId);
    expect(ids.indexOf(newer)).toBeLessThan(ids.indexOf(older));

    const providerOnly = await run(() => requests.listForAdmin({ status: "open", audience: "provider" }, 500, null));
    const providerOnlyOwn = providerOnly.items.filter(isOwnFixture);
    expect(providerOnlyOwn.every((i) => i.audience === "provider")).toBe(true);
    expect(providerOnlyOwn.map((i) => i.threadId)).toContain(older);

    const resolved = await run(() => requests.listForAdmin({ status: "resolved" }, 500, null));
    const resolvedOwn = resolved.items.filter(isOwnFixture);
    expect(resolvedOwn.map((i) => i.threadId)).toContain(resolvedId);
    expect(resolvedOwn.find((i) => i.threadId === resolvedId)?.resolvedAt).not.toBeNull();

    // Paging: walk one page at a time until this test's own three fixtures
    // have all turned up — not a fixed 200-page ceiling, which a shared
    // queue could either blow past (flaky/slow) or exhaust before reaching
    // these rows (a false failure) depending on how much else is in it.
    const seen: string[] = [];
    const fixtureIds = [older, newer, resolvedId];
    let cursor: string | null = null;
    do {
      const page: Awaited<ReturnType<typeof requests.listForAdmin>> = await run(() => requests.listForAdmin({}, 1, cursor));
      seen.push(...page.items.map((i) => i.threadId));
      cursor = page.nextCursor;
    } while (cursor && !fixtureIds.every((id) => seen.includes(id)));
    expect(new Set(seen).size).toBe(seen.length);
    for (const id of fixtureIds) expect(seen).toContain(id);
  });

  test("countOpen moves with the queue", async () => {
    const before = await run(() => requests.countOpen());
    const id = await openPersonal("Count");
    expect(await run(() => requests.countOpen())).toBe(before + 1);
    await run(async () => requests.save((await requests.findByThreadId(id))!.resolve(adminId, NOW)));
    expect(await run(() => requests.countOpen())).toBe(before);
  });

  test("a malformed cursor is refused, not treated as page one", async () => {
    await expect(run(() => requests.listForAdmin({}, 10, "nonsense"))).rejects.toBeInstanceOf(CursorInvalidError);
  });
});
