import { describe, expect, it } from "vitest";
import {
  ProviderDocumentStatus,
  ProviderDocumentType,
  currentDocument,
  replacementNeedsReview,
} from "../provider-document.enum";

/** One row as the table stores it, trimmed to what these rules read. */
function doc(
  type: ProviderDocumentType,
  status: ProviderDocumentStatus,
  uploadedAt: string,
) {
  return { type, status, uploadedAt };
}

describe("replacementNeedsReview", () => {
  it("re-opens review when an accepted document is replaced", () => {
    // The whole point. A real ID earns the badge; the file is then swapped for
    // a forgery. The new upload is pending on its own, but without this the
    // provider stays Active on an approval that no longer describes anything
    // on file.
    expect(replacementNeedsReview(ProviderDocumentStatus.Accepted)).toBe(true);
  });

  it("does not re-open review for a pending document", () => {
    // Someone replacing a blurry photograph before anyone has looked at it.
    // Re-opening a review that never closed is noise.
    expect(replacementNeedsReview(ProviderDocumentStatus.Pending)).toBe(false);
  });

  it("does not re-open review for a rejected document", () => {
    // This is the intended response to a rejection, not a suspicious act.
    expect(replacementNeedsReview(ProviderDocumentStatus.Rejected)).toBe(false);
  });

  it("does not re-open review for a first upload", () => {
    expect(replacementNeedsReview(null)).toBe(false);
    expect(replacementNeedsReview(undefined)).toBe(false);
  });
});

describe("currentDocument", () => {
  const NATIONAL_ID = ProviderDocumentType.NationalId;

  it("is the newest of a type", () => {
    const docs = [
      doc(NATIONAL_ID, ProviderDocumentStatus.Pending, "2026-08-02T00:00:00.000Z"),
      doc(NATIONAL_ID, ProviderDocumentStatus.Rejected, "2026-08-01T00:00:00.000Z"),
    ];
    expect(currentDocument(docs, NATIONAL_ID)?.uploadedAt).toBe(
      "2026-08-02T00:00:00.000Z",
    );
  });

  it("ignores superseded rows however new they are", () => {
    // A superseded row is history. If it could still be "current", the append-
    // only table would be back to describing whatever was written last — which
    // is the mutable column this design exists to avoid.
    const docs = [
      doc(NATIONAL_ID, ProviderDocumentStatus.Superseded, "2026-08-09T00:00:00.000Z"),
      doc(NATIONAL_ID, ProviderDocumentStatus.Accepted, "2026-08-01T00:00:00.000Z"),
    ];
    expect(currentDocument(docs, NATIONAL_ID)?.status).toBe(
      ProviderDocumentStatus.Accepted,
    );
  });

  it("does not let one type answer for another", () => {
    const docs = [doc(NATIONAL_ID, ProviderDocumentStatus.Accepted, "2026-08-01T00:00:00.000Z")];
    expect(currentDocument(docs, ProviderDocumentType.TaxNumber)).toBeNull();
  });

  it("is null when nothing has been uploaded", () => {
    expect(currentDocument([], NATIONAL_ID)).toBeNull();
  });

  it("keeps the accepted row visible after a replacement arrives", () => {
    // The reviewer's decision survives the swap and stays attached to the file
    // they actually looked at. Reconstructing "what was approved, and when did
    // it change" is the audit trail — and it is only possible because the old
    // row was superseded rather than overwritten.
    const docs = [
      doc(NATIONAL_ID, ProviderDocumentStatus.Pending, "2026-08-10T00:00:00.000Z"),
      doc(NATIONAL_ID, ProviderDocumentStatus.Superseded, "2026-08-01T00:00:00.000Z"),
    ];
    expect(currentDocument(docs, NATIONAL_ID)?.status).toBe(
      ProviderDocumentStatus.Pending,
    );
    expect(docs.filter((d) => d.status === ProviderDocumentStatus.Superseded)).toHaveLength(1);
  });
});
