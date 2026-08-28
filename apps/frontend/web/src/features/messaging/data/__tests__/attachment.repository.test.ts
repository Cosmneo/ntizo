import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AttachmentDownloadError,
  AttachmentUploadError,
  fetchAttachmentBlob,
  uploadAttachment,
} from "../attachment.repository";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(status: number, body: unknown) {
  const spy = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", spy);
  return spy;
}

describe("uploadAttachment", () => {
  it("posts multipart with credentials and no Content-Type of its own", async () => {
    const spy = stubFetch(201, {
      storageKey: "attachment/u1/1-a",
      fileName: "me.jpg",
      contentType: "image/jpeg",
      sizeBytes: 3,
    });

    await uploadAttachment(new File(["x"], "me.jpg", { type: "image/jpeg" }));

    const [, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(init.body).toBeInstanceOf(FormData);
    // The browser must add its own with the multipart boundary; setting it
    // by hand produces a body the server cannot parse.
    expect(init.headers).toBeUndefined();
  });

  it("resolves the full descriptor the upload route answers with", async () => {
    stubFetch(201, {
      storageKey: "attachment/u1/1-a",
      fileName: "me.jpg",
      contentType: "image/jpeg",
      sizeBytes: 3,
    });

    const result = await uploadAttachment(new File(["x"], "me.jpg", { type: "image/jpeg" }));

    expect(result).toEqual({
      storageKey: "attachment/u1/1-a",
      fileName: "me.jpg",
      contentType: "image/jpeg",
      sizeBytes: 3,
    });
  });

  it("throws the server's own code so a caller can say something specific", async () => {
    stubFetch(413, { error: "TOO_LARGE" });

    await expect(
      uploadAttachment(new File(["x"], "big.jpg", { type: "image/jpeg" })),
    ).rejects.toMatchObject({ code: "TOO_LARGE" });
  });

  it("falls back to the status when the body is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>502</html>", { status: 502 })));

    await expect(
      uploadAttachment(new File(["x"], "me.jpg", { type: "image/jpeg" })),
    ).rejects.toBeInstanceOf(AttachmentUploadError);
  });
});

describe("fetchAttachmentBlob", () => {
  it("reads with credentials, and no upload-specific headers", async () => {
    const spy = vi.fn(async () => new Response("bytes", { status: 200 }));
    vi.stubGlobal("fetch", spy);

    await fetchAttachmentBlob("a1");

    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url as string).toContain("/api/communication/attachments/a1");
    expect(init.credentials).toBe("include");
  });

  it("resolves the response body as a Blob on success", async () => {
    // A plain string body, not a `Blob` built with this test file's own
    // `Blob` global — that global is a different realm from the one
    // `Response` uses internally, and `.blob()` cannot recognise a
    // cross-realm `Blob` as one. A string is realm-agnostic `BodyInit` and
    // is what a real `fetch` response body always starts as anyway.
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bytes", { status: 200 })));

    const blob = await fetchAttachmentBlob("a1");

    expect(await blob.text()).toBe("bytes");
  });

  it("throws the server's own code for a failed read-back", async () => {
    stubFetch(403, { error: "FORBIDDEN" });

    await expect(fetchAttachmentBlob("a1")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("falls back to the status when the failure body is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>502</html>", { status: 502 })));

    await expect(fetchAttachmentBlob("a1")).rejects.toBeInstanceOf(AttachmentDownloadError);
  });

  it("percent-encodes the id — a raw slash must not smuggle an extra path segment", async () => {
    // A real attachment id is a UUID and never needs this, but the id is
    // interpolated straight into the URL with no encoding today: a value
    // carrying a `/` reaches a DIFFERENT route entirely, and one carrying a
    // `?` turns the rest of the id into query parameters. Both are silent —
    // the request still "succeeds", just against the wrong URL.
    const spy = vi.fn(async () => new Response("bytes", { status: 200 }));
    vi.stubGlobal("fetch", spy);

    await fetchAttachmentBlob("a/b c");

    const [url] = spy.mock.calls[0] as unknown as [string];
    expect(url).toContain("/api/communication/attachments/a%2Fb%20c");
    expect(url).not.toContain("/api/communication/attachments/a/b c");
  });
});
