import { describe, expect, it } from "bun:test";
import type { R2Bucket, R2Object } from "@cloudflare/workers-types";
import { AttachmentStorageAdapter, runWithAttachmentsBucket } from "../attachment-storage.adapter";

/** Only the fields `AttachmentStorageAdapter.head` actually reads. */
function fakeR2Object(overrides: {
  size: number;
  contentType?: string;
  uploadedByUserId?: string;
}): R2Object {
  return {
    size: overrides.size,
    httpMetadata: overrides.contentType ? { contentType: overrides.contentType } : undefined,
    customMetadata: overrides.uploadedByUserId ? { uploadedByUserId: overrides.uploadedByUserId } : undefined,
  } as unknown as R2Object;
}

function fakeBucket(objects: Record<string, R2Object> = {}): R2Bucket {
  return {
    async head(key: string) {
      return objects[key] ?? null;
    },
  } as unknown as R2Bucket;
}

describe("AttachmentStorageAdapter.head", () => {
  it("returns null with no bucket in scope at all — never throws", async () => {
    const adapter = new AttachmentStorageAdapter();
    await expect(adapter.head("attachment/u1/one.png")).resolves.toBeNull();
  });

  it("returns null when no `ATTACHMENTS_BUCKET` binding was scoped for this run", async () => {
    const adapter = new AttachmentStorageAdapter();
    const result = await runWithAttachmentsBucket(undefined, () =>
      adapter.head("attachment/u1/one.png"),
    );
    expect(result).toBeNull();
  });

  it("returns null when the object does not exist in the bucket", async () => {
    const adapter = new AttachmentStorageAdapter();
    const bucket = fakeBucket();
    const result = await runWithAttachmentsBucket(bucket, () => adapter.head("attachment/u1/missing.png"));
    expect(result).toBeNull();
  });

  it("maps the sniffed type, the object's own size, and the recorded uploader — never anything else", async () => {
    const adapter = new AttachmentStorageAdapter();
    const bucket = fakeBucket({
      "attachment/u1/photo.png": fakeR2Object({
        size: 4096,
        contentType: "image/png",
        uploadedByUserId: "u1",
      }),
    });

    const result = await runWithAttachmentsBucket(bucket, () => adapter.head("attachment/u1/photo.png"));

    expect(result).toEqual({ contentType: "image/png", sizeBytes: 4096, uploadedByUserId: "u1" });
  });

  it("answers null uploadedByUserId for an object nothing stamped one onto", async () => {
    const adapter = new AttachmentStorageAdapter();
    const bucket = fakeBucket({
      "attachment/u1/orphan.png": fakeR2Object({ size: 10, contentType: "image/png" }),
    });

    const result = await runWithAttachmentsBucket(bucket, () => adapter.head("attachment/u1/orphan.png"));

    expect(result?.uploadedByUserId).toBeNull();
  });
});

describe("runWithAttachmentsBucket", () => {
  it("scopes the bucket to calls made inside it, and only those", async () => {
    const adapter = new AttachmentStorageAdapter();
    const bucketA = fakeBucket({
      "attachment/u1/a.png": fakeR2Object({ size: 1, contentType: "image/png", uploadedByUserId: "u1" }),
    });
    const bucketB = fakeBucket({
      "attachment/u2/b.png": fakeR2Object({ size: 2, contentType: "image/png", uploadedByUserId: "u2" }),
    });

    const [fromA, fromB, outside] = await Promise.all([
      runWithAttachmentsBucket(bucketA, () => adapter.head("attachment/u1/a.png")),
      runWithAttachmentsBucket(bucketB, () => adapter.head("attachment/u2/b.png")),
      adapter.head("attachment/u1/a.png"),
    ]);

    expect(fromA?.uploadedByUserId).toBe("u1");
    expect(fromB?.uploadedByUserId).toBe("u2");
    // No scope at all for this call — never sees either bucket, even though
    // it ran concurrently with both.
    expect(outside).toBeNull();
  });
});
