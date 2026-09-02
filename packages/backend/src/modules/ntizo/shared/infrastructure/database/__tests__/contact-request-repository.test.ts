/**
 * `DrizzleContactRequestRepository` against the real dev database, same
 * mechanism as `booking-repository.test.ts`: `getDb()` resolves through the
 * request-scoped context, and `__runWithTransactionContextForTests` binds this
 * file's own `DEV_DB_URL` client into it for one test body.
 *
 * Rows are scoped by a random `suffix` in the name, and cleaned up by that
 * suffix, so a concurrent run in another worktree cannot collide or be
 * cleaned up by this one.
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { eq, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import * as authSchema from "../../../../../better-auth/infrastructure/database/schema";
import { __runWithTransactionContextForTests } from "../../../../../../shared/infrastructure/database/tx-context";
import { user } from "../user/schemas/user.schema";
import { contactRequest } from "../contact/schemas/contact-request.schema";
import { ContactRequest } from "../../../../bounded-contexts/contact/domain/aggregates/contact-request.aggregate";
import { DrizzleContactRequestRepository } from "../../../../bounded-contexts/contact/infrastructure/repositories/drizzle/contact-request.repository";
import { bestEffortCleanup, DEV_DB_COLD_START_TIMEOUT_MS, openDevDbConnection } from "./dev-db-test-connection";

setDefaultTimeout(DEV_DB_COLD_START_TIMEOUT_MS);

const sql = openDevDbConnection();
const db = drizzle(sql, { schema: authSchema });
const repo = new DrizzleContactRequestRepository();
const suffix = crypto.randomUUID();
const NAME = `Contact Repo Test ${suffix}`;
const IP = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

let requesterId: string;

beforeAll(async () => {
  requesterId = crypto.randomUUID();
  await db.insert(user).values({
    id: requesterId,
    email: `contact-repo-${suffix}@ntizo.test`,
    role: "customer",
    status: "active",
  });
});

afterAll(async () => {
  await bestEffortCleanup([
    () => db.delete(contactRequest).where(like(contactRequest.name, `${NAME}%`)),
    () => db.delete(user).where(eq(user.id, requesterId)),
    () => sql.end({ timeout: 5 }),
  ]);
}, DEV_DB_COLD_START_TIMEOUT_MS);

function fresh(over: Partial<Parameters<typeof ContactRequest.create>[0]> = {}) {
  return ContactRequest.create({
    kind: "contact",
    topic: "general",
    name: NAME,
    email: `joana-${suffix}@exemplo.com`,
    message: "Gostava de propor uma parceria com a minha escola.",
    locale: "pt-MZ",
    originPath: null,
    requesterUserId: requesterId,
    ipAddress: IP,
    userAgent: "test",
    ...over,
  });
}

describe("DrizzleContactRequestRepository", () => {
  test("insert returns the request with an id and a creation time, and findById reads it back whole", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const saved = await repo.insert(fresh());
      expect(saved.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(saved.createdAt).toBeInstanceOf(Date);
      expect(saved.reference).toHaveLength(6);

      const found = await repo.findById(saved.id!);
      expect(found).not.toBeNull();
      expect(found!.name).toBe(NAME);
      expect(found!.email).toBe(`joana-${suffix}@exemplo.com`);
      expect(found!.kind).toBe("contact");
      expect(found!.topic).toBe("general");
      expect(found!.requesterUserId).toBe(requesterId);
      expect(found!.status).toBe("open");
      expect(found!.ipAddress).toBe(IP);
    }, { commit: true });
  });

  test("findById answers null for an id nobody has", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      expect(await repo.findById(crypto.randomUUID())).toBeNull();
    });
  });

  test("saveStatus writes the resolution and reports whether the row existed", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const saved = await repo.insert(fresh());
      const at = new Date("2026-09-02T10:00:00.000Z");
      expect(await repo.saveStatus(saved.resolve(at, requesterId))).toBe(true);

      const found = await repo.findById(saved.id!);
      expect(found!.status).toBe("resolved");
      expect(found!.resolvedAt).toEqual(at);
      expect(found!.resolvedByUserId).toBe(requesterId);

      const ghost = fresh().withId(crypto.randomUUID());
      expect(await repo.saveStatus(ghost)).toBe(false);
    }, { commit: true });
  });

  test("countFromIpSince counts only this address, only since the moment given", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const before = await repo.countFromIpSince(IP, new Date(Date.now() - 60 * 60 * 1000));
      await repo.insert(fresh());
      await repo.insert(fresh({ ipAddress: "10.255.255.254" }));
      const after = await repo.countFromIpSince(IP, new Date(Date.now() - 60 * 60 * 1000));
      expect(after).toBe(before + 1);
      expect(await repo.countFromIpSince(IP, new Date(Date.now() + 60 * 1000))).toBe(0);
    }, { commit: true });
  });

  test("listForAdmin filters by kind and status, searches four fields, and counts open rows across the table", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const a = await repo.insert(fresh({ message: `Mensagem única ${suffix} sobre uma parceria.` }));
      const b = await repo.insert(fresh({ kind: "feedback", topic: "idea", email: null, message: `Uma ideia ${suffix} para a página inicial.` }));
      await repo.saveStatus(b.resolve(new Date(), requesterId));

      const bySuffix = await repo.listForAdmin({ limit: 50, offset: 0, search: suffix });
      expect(bySuffix.items.map((r) => r.id)).toEqual(expect.arrayContaining([a.id, b.id]));
      expect(bySuffix.total).toBeGreaterThanOrEqual(2);

      const openOnly = await repo.listForAdmin({ limit: 50, offset: 0, search: suffix, status: "open" });
      expect(openOnly.items.map((r) => r.id)).toContain(a.id!);
      expect(openOnly.items.map((r) => r.id)).not.toContain(b.id!);

      const feedbackOnly = await repo.listForAdmin({ limit: 50, offset: 0, search: suffix, kind: "feedback" });
      expect(feedbackOnly.items.map((r) => r.id)).toEqual([b.id!]);

      const byReference = await repo.listForAdmin({ limit: 50, offset: 0, search: a.reference.toLowerCase() });
      expect(byReference.items.map((r) => r.id)).toContain(a.id!);
      expect(byReference.items.find((r) => r.id === a.id)!.reference).toBe(a.reference);

      // openCount ignores the filters: it is the badge for the whole queue.
      expect(feedbackOnly.openCount).toBe(openOnly.openCount);
      expect(openOnly.openCount).toBeGreaterThanOrEqual(1);
    }, { commit: true });
  });
});
