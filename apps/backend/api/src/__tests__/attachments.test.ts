import { describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";
import { hasContact } from "@ntizo/shared/text";
import * as betterAuth from "@ntizo/backend/modules/better-auth";
import { MAX_ATTACHMENT_BYTES } from "@ntizo/backend/modules/ntizo/bounded-contexts/communication";
import type { AttachmentRepositoryPort } from "@ntizo/backend/modules/ntizo/bounded-contexts/communication";
import type { AppBindings } from "../types";

/**
 * Swaps the session the route will see, and NOTHING else about the module.
 *
 * The spread is load-bearing — see `better-auth-mock-isolation.test.ts` for
 * why a factory returning only `getAuth` would delete every other export and
 * take unrelated test files down with it, depending on filesystem walk order.
 * Copied verbatim from `media-avatar.test.ts`, the established pattern for
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
 * it makes through `bootstrapUserRead()`.
 *
 * Mocks `../admin-access`, not `@ntizo/backend/modules/ntizo/read/user`:
 * that package's `bootstrapUserRead` returns a much bigger object
 * (`useCases.getCurrentUser`, `listMyAddresses`, `listUsersForAdmin`,
 * `adapters.addressReadRepository`...) that `schema-mount.test.ts` builds
 * for real via `buildPrivateGraphQLFields()`. `mock.module` replaces a
 * module for the rest of the test PROCESS (see
 * `better-auth-mock-isolation.test.ts`), so a factory shaped only for
 * `findPlatformRole` would leak into that unrelated file — whichever runs
 * second, by filesystem order — and crash it reading `.getCurrentUser` off
 * an object that was never given one. `admin-access.ts` has exactly one
 * export and nothing else in this app's test suite reaches
 * `isPlatformAdmin`-gated code, so overwriting the whole module here is
 * safe to leak.
 */
function withPlatformRole(role: "admin" | "customer" | null) {
  mock.module("../admin-access", () => ({
    isPlatformAdmin: async () => role === "admin",
  }));
}

interface PutCall {
  key: string;
  body: Uint8Array;
  metadata: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> };
}

function fakeBucket(objects: Record<string, { body: unknown }> = {}) {
  const puts: PutCall[] = [];
  return {
    puts,
    bucket: {
      async put(key: string, body: Uint8Array, metadata: PutCall["metadata"]) {
        puts.push({ key, body, metadata });
        objects[key] = { body };
      },
      async get(key: string) {
        return objects[key] ?? null;
      },
    },
  };
}

/** Never sees a row — the shape every upload test that never reaches the download route needs. */
function noRowRepository(): AttachmentRepositoryPort {
  return {
    insertMany: async () => {},
    listForMessages: async () => new Map(),
    findVisible: async () => null,
    findOnSupportThread: async () => null,
  };
}

/** Sees exactly one row, and only for the one viewer allowed to. */
function repoWithRow(
  row: Awaited<ReturnType<AttachmentRepositoryPort["findVisible"]>>,
  ownerUserId: string,
): AttachmentRepositoryPort {
  return {
    insertMany: async () => {},
    listForMessages: async () => new Map(),
    findVisible: async (id, viewerUserId) =>
      row !== null && id === row.id && viewerUserId === ownerUserId ? row : null,
    findOnSupportThread: async () => null,
  };
}

/**
 * `findVisible` always refuses — the shape every admin-branch test starts
 * from, since the admin branch is only ever reached AFTER that refusal. A
 * spy counts calls to `findOnSupportThread`, which is the assertion that
 * proves a non-admin's refusal never reaches it — the one thing that keeps
 * this branch admin-only rather than an admin bypass on `findVisible`.
 */
function repoRefusingVisible(supportRow: Awaited<ReturnType<AttachmentRepositoryPort["findOnSupportThread"]>>): {
  repository: AttachmentRepositoryPort;
  findOnSupportThreadCalls: string[];
} {
  const findOnSupportThreadCalls: string[] = [];
  return {
    findOnSupportThreadCalls,
    repository: {
      insertMany: async () => {},
      listForMessages: async () => new Map(),
      findVisible: async () => null,
      findOnSupportThread: async (id) => {
        findOnSupportThreadCalls.push(id);
        return supportRow;
      },
    },
  };
}

/**
 * Builds a fresh app per call, mounted AFTER `withSession` has already swapped
 * the module — same reason `media-avatar.test.ts`'s `subject()` imports `../media`
 * dynamically rather than at file scope: it guarantees the route's own
 * `getAuth` import resolves against the mock, not a copy cached before it.
 */
async function subject(env: Partial<AppBindings>, attachmentRepository: AttachmentRepositoryPort) {
  const { mountAttachments } = await import("../attachments");
  const app = new Hono<{ Bindings: AppBindings }>();
  mountAttachments(app, { attachmentRepository });
  return async (path: string, init: RequestInit = {}) => app.request(path, init, env as AppBindings);
}

function jpegBytes(size: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;
  return bytes;
}

function jpegNamed(name: string, size = 3): File {
  return new File([jpegBytes(size)], name, { type: "image/jpeg" });
}

function htmlBytesNamed(name: string, declaredType: string): File {
  return new File(["<script>alert(1)</script>"], name, { type: declaredType });
}

function formWith(file: File): FormData {
  const form = new FormData();
  form.append("file", file);
  return form;
}

type Requester = (path: string, init?: RequestInit) => Promise<Response>;

function postFile(request: Requester, file: File): Promise<Response> {
  return request("/api/communication/attachments", { method: "POST", body: formWith(file) });
}

describe("POST /api/communication/attachments", () => {
  it("refuses an anonymous caller with 401, without reaching the bucket", async () => {
    withSession(null);
    const { bucket, puts } = fakeBucket();
    const request = await subject(
      { ATTACHMENTS_BUCKET: bucket } as unknown as Partial<AppBindings>,
      noRowRepository(),
    );

    const res = await postFile(request, jpegNamed("photo.jpg"));

    expect(res.status).toBe(401);
    expect(puts).toHaveLength(0);
  });

  it("refuses a file whose bytes disagree with its declared type", async () => {
    // The real version of Task 3's deleted "does not trust a declared type
    // over the bytes" test: this route is the one place that holds BOTH the
    // caller's declared `file.type` and the sniffed answer.
    withSession({ id: "u1" });
    const { bucket, puts } = fakeBucket();
    const request = await subject(
      { ATTACHMENTS_BUCKET: bucket } as unknown as Partial<AppBindings>,
      noRowRepository(),
    );

    const res = await postFile(request, htmlBytesNamed("invoice.pdf", "application/pdf"));

    expect(res.status).toBe(415);
    expect(puts).toHaveLength(0);
  });

  it("refuses a file over ten megabytes", async () => {
    withSession({ id: "u1" });
    const { bucket, puts } = fakeBucket();
    const request = await subject(
      { ATTACHMENTS_BUCKET: bucket } as unknown as Partial<AppBindings>,
      noRowRepository(),
    );

    const res = await postFile(request, jpegNamed("big.jpg", MAX_ATTACHMENT_BYTES + 1));

    expect(res.status).toBe(413);
    expect(puts).toHaveLength(0);
  });

  it("answers 503 when the bucket is not configured", async () => {
    withSession({ id: "u1" });
    const request = await subject({} as unknown as Partial<AppBindings>, noRowRepository());

    const res = await postFile(request, jpegNamed("photo.jpg"));

    expect(res.status).toBe(503);
  });

  it("refuses a file whose NAME carries a phone number", async () => {
    // The client checks this too, for immediate feedback. This is the gate:
    // a client-side check is bypassed with one `curl`, and a file name is the
    // obvious way around a rule about the message body.
    withSession({ id: "u1" });
    const { bucket, puts } = fakeBucket();
    const request = await subject(
      { ATTACHMENTS_BUCKET: bucket } as unknown as Partial<AppBindings>,
      noRowRepository(),
    );

    const res = await postFile(request, jpegNamed("liga-me-841234567.jpg"));

    expect(res.status).toBe(422);
    expect(puts).toHaveLength(0);
  });

  /**
   * Truncation can CREATE a contact the check never saw. `PHONE` in the
   * shared detector is `\b`-anchored, so `8412345678` — ten digits — does
   * not match: there is no word boundary between the ninth digit and the
   * tenth. Cut the tail at 200 characters and `841234567` is left, which
   * does match, and that shorter string is what gets stored and shown to
   * the other side.
   *
   * A test that checks the same string the route stores cannot tell these
   * apart. This one is built so it can: the full name is deliberately clean
   * and only the stored form is dirty, so it passes only when the route
   * truncates before it checks.
   */
  it("refuses a name that only carries a phone number once truncated to what is stored", async () => {
    withSession({ id: "u1" });
    const { bucket, puts } = fakeBucket();
    const request = await subject(
      { ATTACHMENTS_BUCKET: bucket } as unknown as Partial<AppBindings>,
      noRowRepository(),
    );

    // 205 characters. Clean whole; dirty at 200.
    const name = `${"x".repeat(190)}-8412345678.jpg`;
    expect(hasContact(name)).toBe(false);
    expect(hasContact(name.slice(0, 200))).toBe(true);

    const res = await postFile(request, jpegNamed(name));

    expect(res.status).toBe(422);
    expect(puts).toHaveLength(0);
  });

  it("refuses a file with no name at all", async () => {
    withSession({ id: "u1" });
    const { bucket, puts } = fakeBucket();
    const request = await subject(
      { ATTACHMENTS_BUCKET: bucket } as unknown as Partial<AppBindings>,
      noRowRepository(),
    );

    const res = await postFile(request, jpegNamed(""));

    expect(res.status).toBe(422);
    expect(puts).toHaveLength(0);
  });

  it("stores the sniffed type, keys the object by the SESSION's user id, and answers 201 with no id", async () => {
    withSession({ id: "u1" });
    const { bucket, puts } = fakeBucket();
    const request = await subject(
      { ATTACHMENTS_BUCKET: bucket } as unknown as Partial<AppBindings>,
      noRowRepository(),
    );

    const res = await postFile(request, jpegNamed("me.jpg"));

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      storageKey: string;
      fileName: string;
      contentType: string;
      sizeBytes: number;
    };
    expect(body.storageKey).toMatch(/^attachment\/u1\//);
    expect(body.fileName).toBe("me.jpg");
    expect(body.contentType).toBe("image/jpeg");
    expect(body.sizeBytes).toBe(3);
    // No `id`: no row exists yet. That only happens once `sendMessage`
    // carries this exact descriptor back in and writes it.
    expect(Object.keys(body).sort()).toEqual(["contentType", "fileName", "sizeBytes", "storageKey"]);

    expect(puts).toHaveLength(1);
    expect(puts[0]!.metadata.customMetadata).toEqual({ uploadedByUserId: "u1", originalName: "me.jpg" });
    // Never `file.type`, which the caller chose. Stored as what the bytes
    // actually sniffed to.
    expect(puts[0]!.metadata.httpMetadata?.contentType).toBe("image/jpeg");
  });
});

describe("GET /api/communication/attachments/:id", () => {
  const row = {
    id: crypto.randomUUID(),
    messageId: crypto.randomUUID(),
    storageKey: "attachment/owner-1/123-abc",
    fileName: "invoice.pdf",
    contentType: "application/pdf",
    sizeBytes: 3,
    createdAt: new Date("2026-08-20T10:00:00.000Z"),
  };
  const owner = { id: "owner-1" };
  const stranger = { id: "stranger-1" };

  it("refuses an anonymous caller with 401", async () => {
    withSession(null);
    const { bucket } = fakeBucket({ [row.storageKey]: { body: "pdf-bytes" } });
    const request = await subject(
      { ATTACHMENTS_BUCKET: bucket } as unknown as Partial<AppBindings>,
      repoWithRow(row, owner.id),
    );

    const res = await request(`/api/communication/attachments/${row.id}`);

    expect(res.status).toBe(401);
  });

  it("serves a download as an attachment, never inline", async () => {
    withSession(owner);
    const { bucket } = fakeBucket({ [row.storageKey]: { body: "pdf-bytes" } });
    const request = await subject(
      { ATTACHMENTS_BUCKET: bucket } as unknown as Partial<AppBindings>,
      repoWithRow(row, owner.id),
    );

    const res = await request(`/api/communication/attachments/${row.id}`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("content-type")).toBe("application/pdf");
  });

  it("gives a stranger the same answer as a missing attachment", async () => {
    const repo = repoWithRow(row, owner.id);
    const { bucket } = fakeBucket({ [row.storageKey]: { body: "pdf-bytes" } });

    // Neither caller here is an admin — `findVisible` refusing now falls
    // through to `isPlatformAdmin`, which without this would reach the real
    // database.
    withPlatformRole("customer");
    withSession(stranger);
    const strangerRequest = await subject(
      { ATTACHMENTS_BUCKET: bucket } as unknown as Partial<AppBindings>,
      repo,
    );
    const mine = await strangerRequest(`/api/communication/attachments/${row.id}`);

    withSession(owner);
    const ownerRequest = await subject(
      { ATTACHMENTS_BUCKET: bucket } as unknown as Partial<AppBindings>,
      repo,
    );
    const missing = await ownerRequest(`/api/communication/attachments/${crypto.randomUUID()}`);

    expect(mine.status).toBe(missing.status);
    expect(mine.status).toBe(403);
  });

  it("does not let a stored file name inject a header", async () => {
    // Nothing upstream of the download route guarantees a clean name.
    // `NewAttachment.fileName` is `stored.originalName` (Critical 2's fix) —
    // whatever `file.name` the uploader's OS or API client sent, sliced to
    // 200 characters by the upload leg above but never otherwise sanitised.
    // This is the one place that string reaches an actual HTTP header, so
    // this is where it has to be made safe, regardless of what wrote the row.
    const injected = {
      ...row,
      fileName: 'evil.jpg"\r\nX-Injected: yes',
    };
    withSession(owner);
    const { bucket } = fakeBucket({ [injected.storageKey]: { body: "pdf-bytes" } });
    const request = await subject(
      { ATTACHMENTS_BUCKET: bucket } as unknown as Partial<AppBindings>,
      repoWithRow(injected, owner.id),
    );

    const res = await request(`/api/communication/attachments/${injected.id}`);

    expect(res.status).toBe(200);
    const disposition = res.headers.get("content-disposition") ?? "";
    // The CR and LF are what would have turned "X-Injected: yes" into a
    // second, attacker-chosen header — stripping them leaves the text inert:
    // still present, but as harmless characters inside one filename value,
    // never as a line of its own.
    expect(disposition).not.toContain("\r");
    expect(disposition).not.toContain("\n");
    expect(disposition).toMatch(/^attachment; filename="[^"]*"$/);
  });

  it("strips a backslash from a stored file name — a plain shape-match cannot tell this happened", async () => {
    // RFC 6266's quoted-string grammar treats `\` as an escape character: a
    // backslash sitting right before the template's own closing `"` can
    // leave an RFC-aware parser reading the value as unterminated rather
    // than closed. The test above's `^attachment; filename="[^"]*"$` regex
    // is blind to this — `\` is not a `"`, so it satisfies that shape either
    // way (quotes are already stripped, so no combination of quote-plus-
    // backslash can appear for that regex to catch). This asserts the
    // header directly instead: the backslash itself must not survive.
    const injected = { ...row, fileName: "evil.jpg\\" };
    withSession(owner);
    const { bucket } = fakeBucket({ [injected.storageKey]: { body: "pdf-bytes" } });
    const request = await subject(
      { ATTACHMENTS_BUCKET: bucket } as unknown as Partial<AppBindings>,
      repoWithRow(injected, owner.id),
    );

    const res = await request(`/api/communication/attachments/${injected.id}`);

    expect(res.status).toBe(200);
    const disposition = res.headers.get("content-disposition") ?? "";
    expect(disposition).not.toContain("\\");
  });

  it("answers 404 when the row exists but the bucket object does not", async () => {
    withSession(owner);
    const { bucket } = fakeBucket(); // empty — nothing stored under row.storageKey
    const request = await subject(
      { ATTACHMENTS_BUCKET: bucket } as unknown as Partial<AppBindings>,
      repoWithRow(row, owner.id),
    );

    const res = await request(`/api/communication/attachments/${row.id}`);

    expect(res.status).toBe(404);
  });

  /**
   * `attachment.id` is a `uuid` column; a real `DrizzleAttachmentRepository`
   * throws `invalid input syntax for type uuid` for anything that is not
   * UUID-shaped, which an unhandled throw turns into a 500 — the one
   * response this route's whole design says never happens (every failure
   * answers 403, so a stranger probing ids learns nothing). A fake matching
   * `row.id` by plain string equality could never reproduce that failure
   * mode, so this one simulates it directly: it throws exactly what
   * Postgres throws, for exactly the malformed-id case, and this proves the
   * route refuses BEFORE the repository is ever called with it.
   */
  it("answers 403, not 500, for an id that is not UUID-shaped", async () => {
    withSession(owner);
    const repo: AttachmentRepositoryPort = {
      insertMany: async () => {},
      listForMessages: async () => new Map(),
      findVisible: async (id) => {
        throw new Error(`invalid input syntax for type uuid: "${id}"`);
      },
      findOnSupportThread: async () => null,
    };
    const { bucket } = fakeBucket();
    const request = await subject(
      { ATTACHMENTS_BUCKET: bucket } as unknown as Partial<AppBindings>,
      repo,
    );

    const res = await request("/api/communication/attachments/not-a-uuid");

    expect(res.status).toBe(403);
  });

  it("serves an administrator a support-thread attachment `findVisible` refused", async () => {
    // Not a participant — `findVisible` on this repo always refuses — but
    // the file was sent *to* the platform, so `findOnSupportThread` admits
    // it once `isPlatformAdmin` is true.
    const { repository, findOnSupportThreadCalls } = repoRefusingVisible(row);
    const { bucket } = fakeBucket({ [row.storageKey]: { body: "pdf-bytes" } });
    withPlatformRole("admin");
    withSession({ id: "admin-1" });
    const request = await subject(
      { ATTACHMENTS_BUCKET: bucket } as unknown as Partial<AppBindings>,
      repository,
    );

    const res = await request(`/api/communication/attachments/${row.id}`);

    expect(res.status).toBe(200);
    expect(findOnSupportThreadCalls).toEqual([row.id]);
  });

  it("refuses an administrator 403 when the attachment is on no support thread either", async () => {
    const { repository } = repoRefusingVisible(null);
    const { bucket } = fakeBucket();
    withPlatformRole("admin");
    withSession({ id: "admin-1" });
    const request = await subject(
      { ATTACHMENTS_BUCKET: bucket } as unknown as Partial<AppBindings>,
      repository,
    );

    const res = await request(`/api/communication/attachments/${row.id}`);

    expect(res.status).toBe(403);
  });

  /**
   * The assertion that keeps the admin branch admin-only: `findOnSupportThread`
   * is never even called for a non-admin whose `findVisible` refused. Without
   * this, the branch in `attachments.ts` could silently degrade into an admin
   * bypass on `findVisible` itself — exactly what its own doc comment says it
   * must never become.
   */
  it("never calls findOnSupportThread for a non-admin findVisible refused", async () => {
    const { repository, findOnSupportThreadCalls } = repoRefusingVisible(row);
    const { bucket } = fakeBucket({ [row.storageKey]: { body: "pdf-bytes" } });
    withPlatformRole("customer");
    withSession(stranger);
    const request = await subject(
      { ATTACHMENTS_BUCKET: bucket } as unknown as Partial<AppBindings>,
      repository,
    );

    const res = await request(`/api/communication/attachments/${row.id}`);

    expect(res.status).toBe(403);
    expect(findOnSupportThreadCalls).toEqual([]);
  });
});
