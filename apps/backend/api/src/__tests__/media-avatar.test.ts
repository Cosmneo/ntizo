import { describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";
import type { AppBindings } from "../types";

/** Swaps the session the route will see. Call before importing the module. */
function withSession(sessionUser: unknown) {
  mock.module("@ntizo/backend/modules/better-auth", () => ({
    getAuth: () => ({
      api: { getSession: async () => (sessionUser ? { user: sessionUser } : null) },
    }),
  }));
}

interface PutCall {
  key: string;
  metadata: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> };
}

function fakeBucket() {
  const puts: PutCall[] = [];
  return {
    puts,
    bucket: {
      async put(key: string, _body: unknown, metadata: PutCall["metadata"]) {
        puts.push({ key, metadata });
      },
    },
  };
}

async function subject(env: Partial<AppBindings>) {
  const { mountMedia } = await import("../media");
  const app = new Hono<{ Bindings: AppBindings }>();
  mountMedia(app);
  return (body: FormData) =>
    app.request("/api/media/avatar", { method: "POST", body }, env as AppBindings);
}

function formWith(file: File): FormData {
  const form = new FormData();
  form.append("file", file);
  return form;
}

const JPEG = () => new File([new Uint8Array([1, 2, 3])], "me.jpg", { type: "image/jpeg" });

describe("POST /api/media/avatar", () => {
  it("refuses an anonymous caller with 401, without reaching the bucket", async () => {
    withSession(null);
    const { bucket, puts } = fakeBucket();
    const request = await subject({ MEDIA_BUCKET: bucket } as unknown as Partial<AppBindings>);

    const res = await request(formWith(JPEG()));

    expect(res.status).toBe(401);
    expect(puts).toHaveLength(0);
  });

  it("refuses a PDF with 415", async () => {
    // `accept` on an <input> is a hint to a file dialog and nothing more —
    // one curl away from being irrelevant.
    withSession({ id: "u1" });
    const { bucket, puts } = fakeBucket();
    const request = await subject({ MEDIA_BUCKET: bucket } as unknown as Partial<AppBindings>);

    const res = await request(
      formWith(new File([new Uint8Array([1])], "cv.pdf", { type: "application/pdf" })),
    );

    expect(res.status).toBe(415);
    expect(puts).toHaveLength(0);
  });

  it("refuses a file over 5 MB with 413", async () => {
    // The browser-side size check runs in code the caller controls.
    withSession({ id: "u1" });
    const { bucket, puts } = fakeBucket();
    const request = await subject({ MEDIA_BUCKET: bucket } as unknown as Partial<AppBindings>);

    const tooBig = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.jpg", {
      type: "image/jpeg",
    });
    const res = await request(formWith(tooBig));

    expect(res.status).toBe(413);
    expect(puts).toHaveLength(0);
  });

  it("keys the object by the SESSION's user id and answers 201", async () => {
    withSession({ id: "u1" });
    const { bucket, puts } = fakeBucket();
    const request = await subject({
      MEDIA_BUCKET: bucket,
      MEDIA_PUBLIC_URL_BASE: "https://cdn.example",
    } as unknown as Partial<AppBindings>);

    const res = await request(formWith(JPEG()));

    expect(res.status).toBe(201);
    const body = (await res.json()) as { key: string; url: string | null };
    // The id comes from the session and there is no field in the request that
    // could name a different one — which is the whole reason this route takes
    // no id in its path.
    expect(body.key).toMatch(/^avatar\/u1\/\d+$/);
    expect(body.url).toBe(`https://cdn.example/${body.key}`);
    expect(puts).toHaveLength(1);
    expect(puts[0]!.metadata.customMetadata).toEqual({ uploadedByUserId: "u1" });
  });

  it("answers null for the url when no public base is configured", async () => {
    // Locally, that is every upload. A guessed URL would be worse than none.
    withSession({ id: "u1" });
    const { bucket } = fakeBucket();
    const request = await subject({ MEDIA_BUCKET: bucket } as unknown as Partial<AppBindings>);

    const res = await request(formWith(JPEG()));
    const body = (await res.json()) as { url: string | null };

    expect(res.status).toBe(201);
    expect(body.url).toBeNull();
  });
});
