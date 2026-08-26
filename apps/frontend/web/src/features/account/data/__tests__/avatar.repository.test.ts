import { describe, expect, it, vi, afterEach } from "vitest";
import { uploadMyAvatar, AvatarUploadError } from "../avatar.repository";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(status: number, body: unknown) {
  const spy = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", spy);
  return spy;
}

describe("uploadMyAvatar", () => {
  it("posts multipart with credentials and no Content-Type of its own", async () => {
    const spy = stubFetch(201, { key: "avatar/u1/1", url: "https://cdn/x" });

    await uploadMyAvatar(new File(["x"], "me.jpg", { type: "image/jpeg" }));

    // `spy` is typed from its zero-arg implementation, so `mock.calls[0]` has
    // no overlap with the real `fetch(url, init)` shape TS would infer from
    // the global — go through `unknown` rather than widen the stub's type.
    const [, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(init.body).toBeInstanceOf(FormData);
    // The browser must add its own with the multipart boundary; setting it by
    // hand produces a body the server cannot parse.
    expect(init.headers).toBeUndefined();
  });

  it("throws the server's own code so the caller can say something specific", async () => {
    stubFetch(413, { error: "TOO_LARGE" });

    await expect(
      uploadMyAvatar(new File(["x"], "me.jpg", { type: "image/jpeg" })),
    ).rejects.toMatchObject({ code: "TOO_LARGE" });
  });

  it("falls back to the status when the body is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>502</html>", { status: 502 })));

    await expect(
      uploadMyAvatar(new File(["x"], "me.jpg", { type: "image/jpeg" })),
    ).rejects.toBeInstanceOf(AvatarUploadError);
  });
});
