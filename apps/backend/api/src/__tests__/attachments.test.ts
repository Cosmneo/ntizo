import { describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";
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
    // Nothing upstream of the download route guarantees a clean name — a
    // `NewAttachment.fileName` a caller sent back with `sendMessage` is
    // whatever string they chose, quotes, CR, LF and all. This is the one
    // place that string reaches an actual HTTP header, so this is where it
    // has to be made safe, regardless of what wrote the row.
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
});
