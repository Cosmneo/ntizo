import { describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";
import * as betterAuth from "@ntizo/backend/modules/better-auth";
import type { QuoteAttachmentRepositoryPort } from "@ntizo/backend/modules/ntizo/bounded-contexts/quote";
import type { AppBindings } from "../types";

/**
 * Swaps the session the route will see, and NOTHING else about the module.
 *
 * The spread is load-bearing — see `better-auth-mock-isolation.test.ts` for
 * why a factory returning only `getAuth` would delete every other export
 * and take unrelated test files down with it, depending on filesystem walk
 * order. Copied from `attachments.test.ts`, the established pattern for
 * this exact swap.
 */
function withSession(sessionUser: unknown) {
  mock.module("@ntizo/backend/modules/better-auth", () => ({
    ...betterAuth,
    getAuth: () => ({
      api: { getSession: async () => (sessionUser ? { user: sessionUser } : null) },
    }),
  }));
}

/**
 * Swaps what `isPlatformAdmin` answers, without going near the database call
 * it makes through `bootstrapUserRead()`. Same reasoning as
 * `attachments.test.ts`'s function of the same name: `admin-access.ts` has
 * exactly one export and nothing else in this app's test suite reaches
 * `isPlatformAdmin`-gated code, so overwriting the whole module is safe to
 * leak across files.
 */
function withPlatformRole(role: "admin" | "customer" | null) {
  mock.module("../admin-access", () => ({
    isPlatformAdmin: async () => role === "admin",
  }));
}

interface StoredObject {
  body: unknown;
}

function fakeBucket(objects: Record<string, StoredObject> = {}) {
  return {
    async get(key: string) {
      return objects[key] ?? null;
    },
  };
}

/** Never sees a row — the shape a 401 test or a malformed-id test needs. */
function noRowRepository(): QuoteAttachmentRepositoryPort {
  return {
    insertMany: async () => {},
    findVisible: async () => null,
    findAny: async () => null,
  };
}

/** Sees exactly one row, and only for the viewer(s) allowed to — customer, provider member, both, whichever the test names. */
function repoWithRow(
  row: Awaited<ReturnType<QuoteAttachmentRepositoryPort["findVisible"]>>,
  visibleToUserIds: readonly string[],
): QuoteAttachmentRepositoryPort {
  return {
    insertMany: async () => {},
    findVisible: async (id, viewerUserId) =>
      row !== null && id === row.id && visibleToUserIds.includes(viewerUserId) ? row : null,
    findAny: async () => null,
  };
}

/**
 * `findVisible` always refuses — the shape every admin-branch test starts
 * from, since the admin branch is only ever reached AFTER that refusal. A
 * spy counts calls to `findAny`, which is the assertion that proves a
 * non-admin's refusal never reaches it — the one thing that keeps this
 * branch admin-only rather than an admin bypass on `findVisible` itself.
 */
function repoRefusingVisible(anyRow: Awaited<ReturnType<QuoteAttachmentRepositoryPort["findAny"]>>): {
  repository: QuoteAttachmentRepositoryPort;
  findAnyCalls: string[];
} {
  const findAnyCalls: string[] = [];
  return {
    findAnyCalls,
    repository: {
      insertMany: async () => {},
      findVisible: async () => null,
      findAny: async (id) => {
        findAnyCalls.push(id);
        return anyRow;
      },
    },
  };
}

/**
 * Builds a fresh app per call, mounted AFTER `withSession` has already
 * swapped the module — same reason `attachments.test.ts`'s `subject()`
 * imports `../quote-attachments` dynamically rather than at file scope: it
 * guarantees the route's own `getAuth` import resolves against the mock,
 * not a copy cached before it.
 */
async function subject(env: Partial<AppBindings>, quoteAttachmentRepository: QuoteAttachmentRepositoryPort) {
  const { mountQuoteAttachments } = await import("../quote-attachments");
  const app = new Hono<{ Bindings: AppBindings }>();
  mountQuoteAttachments(app, { quoteAttachmentRepository });
  return async (path: string, init: RequestInit = {}) => app.request(path, init, env as AppBindings);
}

describe("GET /api/quote/attachments/:id", () => {
  const row = {
    id: crypto.randomUUID(),
    quoteId: crypto.randomUUID(),
    proposalId: null,
    step: "request" as const,
    storageKey: "attachment/customer-1/123-abc",
    fileName: "torneira.jpg",
    contentType: "image/jpeg",
    sizeBytes: 12_345,
    createdAt: new Date("2026-08-20T10:00:00.000Z"),
  };
  const customer = { id: "customer-1" };
  const providerMemberUser = { id: "provider-member-1" };
  const stranger = { id: "stranger-1" };

  it("refuses an anonymous caller with 401", async () => {
    withSession(null);
    const request = await subject(
      { ATTACHMENTS_BUCKET: fakeBucket({ [row.storageKey]: { body: "jpeg-bytes" } }) } as unknown as Partial<AppBindings>,
      repoWithRow(row, [customer.id]),
    );

    const res = await request(`/api/quote/attachments/${row.id}`);

    expect(res.status).toBe(401);
  });

  it("serves a download as an attachment, never inline, with a private no-store cache header", async () => {
    withSession(customer);
    const request = await subject(
      { ATTACHMENTS_BUCKET: fakeBucket({ [row.storageKey]: { body: "jpeg-bytes" } }) } as unknown as Partial<AppBindings>,
      repoWithRow(row, [customer.id]),
    );

    const res = await request(`/api/quote/attachments/${row.id}`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="torneira.jpg"');
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("content-type")).toBe("image/jpeg");
  });

  it("serves the same row to the quote's provider-side member too", async () => {
    withSession(providerMemberUser);
    const request = await subject(
      { ATTACHMENTS_BUCKET: fakeBucket({ [row.storageKey]: { body: "jpeg-bytes" } }) } as unknown as Partial<AppBindings>,
      repoWithRow(row, [customer.id, providerMemberUser.id]),
    );

    const res = await request(`/api/quote/attachments/${row.id}`);

    expect(res.status).toBe(200);
  });

  /**
   * The carried-forward requirement at the route level: an unrelated
   * signed-in third party — neither the quote's customer nor a member of
   * its provider — gets EXACTLY the same answer as a request for an id that
   * does not exist. Three distinct users appear across this file (customer,
   * providerMemberUser, stranger); this test is the one that proves the
   * third is refused. The repository join itself is proven against the real
   * database in `quote-attachment-repository.test.ts` — this proves the
   * ROUTE relays that refusal as an indistinguishable 403, never a 500 or a
   * 404 that would leak which ids are real.
   */
  it("gives an unrelated signed-in user the same answer as a missing attachment", async () => {
    const repo = repoWithRow(row, [customer.id, providerMemberUser.id]);
    const bucket = fakeBucket({ [row.storageKey]: { body: "jpeg-bytes" } });

    // Neither caller here is an admin — `findVisible` refusing now falls
    // through to `isPlatformAdmin`, which without this would reach the real
    // database.
    withPlatformRole("customer");
    withSession(stranger);
    const strangerRequest = await subject({ ATTACHMENTS_BUCKET: bucket } as unknown as Partial<AppBindings>, repo);
    const strangerRes = await strangerRequest(`/api/quote/attachments/${row.id}`);

    withSession(customer);
    const missingRequest = await subject({ ATTACHMENTS_BUCKET: bucket } as unknown as Partial<AppBindings>, repo);
    const missingRes = await missingRequest(`/api/quote/attachments/${crypto.randomUUID()}`);

    expect(strangerRes.status).toBe(missingRes.status);
    expect(strangerRes.status).toBe(403);
    expect(await strangerRes.json()).toEqual(await missingRes.json());
  });

  it("answers 403 whether the id exists or not, for a signed-in caller with no visible row", async () => {
    withSession(stranger);
    withPlatformRole("customer");
    const request = await subject(
      { ATTACHMENTS_BUCKET: fakeBucket() } as unknown as Partial<AppBindings>,
      noRowRepository(),
    );

    const existingIdRes = await request(`/api/quote/attachments/${crypto.randomUUID()}`);
    const anotherIdRes = await request(`/api/quote/attachments/${crypto.randomUUID()}`);

    expect(existingIdRes.status).toBe(403);
    expect(anotherIdRes.status).toBe(403);
  });

  /**
   * `quote_attachment.id` is a `uuid` column; a real
   * `DrizzleQuoteAttachmentRepository` throws `invalid input syntax for
   * type uuid` for anything that is not UUID-shaped, which an unhandled
   * throw turns into a 500 — the one response this route's whole design
   * says never happens (every failure answers 403, so a stranger probing
   * ids learns nothing). A fake matching `row.id` by plain string equality
   * could never reproduce that failure mode, so this one simulates it
   * directly, and proves the route refuses BEFORE the repository is ever
   * called with it — the mock never even runs.
   */
  it("answers 403, not 500, for an id that is not UUID-shaped, without reaching the repository", async () => {
    withSession(customer);
    let called = false;
    const repository: QuoteAttachmentRepositoryPort = {
      insertMany: async () => {},
      findVisible: async (id) => {
        called = true;
        throw new Error(`invalid input syntax for type uuid: "${id}"`);
      },
      findAny: async () => null,
    };
    const request = await subject({ ATTACHMENTS_BUCKET: fakeBucket() } as unknown as Partial<AppBindings>, repository);

    const res = await request("/api/quote/attachments/not-a-uuid");

    expect(res.status).toBe(403);
    expect(called).toBe(false);
  });

  it("answers 503 when the bucket is not configured", async () => {
    withSession(customer);
    const request = await subject({} as unknown as Partial<AppBindings>, repoWithRow(row, [customer.id]));

    const res = await request(`/api/quote/attachments/${row.id}`);

    expect(res.status).toBe(503);
  });

  it("answers 404 when the row exists but the bucket object does not", async () => {
    withSession(customer);
    const request = await subject(
      { ATTACHMENTS_BUCKET: fakeBucket() } as unknown as Partial<AppBindings>, // empty — nothing stored under row.storageKey
      repoWithRow(row, [customer.id]),
    );

    const res = await request(`/api/quote/attachments/${row.id}`);

    expect(res.status).toBe(404);
  });

  it("does not let a stored file name inject a header", async () => {
    const injected = { ...row, fileName: 'evil.jpg"\r\nX-Injected: yes' };
    withSession(customer);
    const request = await subject(
      { ATTACHMENTS_BUCKET: fakeBucket({ [injected.storageKey]: { body: "jpeg-bytes" } }) } as unknown as Partial<AppBindings>,
      repoWithRow(injected, [customer.id]),
    );

    const res = await request(`/api/quote/attachments/${injected.id}`);

    expect(res.status).toBe(200);
    const disposition = res.headers.get("content-disposition") ?? "";
    expect(disposition).not.toContain("\r");
    expect(disposition).not.toContain("\n");
    expect(disposition).toMatch(/^attachment; filename="[^"]*"$/);
  });

  it("serves an administrator an attachment findVisible refused, through findAny", async () => {
    const { repository, findAnyCalls } = repoRefusingVisible(row);
    withPlatformRole("admin");
    withSession({ id: "admin-1" });
    const request = await subject(
      { ATTACHMENTS_BUCKET: fakeBucket({ [row.storageKey]: { body: "jpeg-bytes" } }) } as unknown as Partial<AppBindings>,
      repository,
    );

    const res = await request(`/api/quote/attachments/${row.id}`);

    expect(res.status).toBe(200);
    expect(findAnyCalls).toEqual([row.id]);
  });

  it("refuses an administrator 403 when findAny finds nothing either", async () => {
    const { repository } = repoRefusingVisible(null);
    withPlatformRole("admin");
    withSession({ id: "admin-1" });
    const request = await subject({ ATTACHMENTS_BUCKET: fakeBucket() } as unknown as Partial<AppBindings>, repository);

    const res = await request(`/api/quote/attachments/${row.id}`);

    expect(res.status).toBe(403);
  });

  /**
   * The assertion that keeps the admin branch admin-only: `findAny` is
   * never even called for a non-admin whose `findVisible` refused. Without
   * this, the branch in `quote-attachments.ts` could silently degrade into
   * an admin bypass on `findVisible` itself.
   */
  it("never calls findAny for a non-admin findVisible refused", async () => {
    const { repository, findAnyCalls } = repoRefusingVisible(row);
    withPlatformRole("customer");
    withSession(stranger);
    const request = await subject(
      { ATTACHMENTS_BUCKET: fakeBucket({ [row.storageKey]: { body: "jpeg-bytes" } }) } as unknown as Partial<AppBindings>,
      repository,
    );

    const res = await request(`/api/quote/attachments/${row.id}`);

    expect(res.status).toBe(403);
    expect(findAnyCalls).toEqual([]);
  });
});
