import { describe, expect, it } from "vitest";
import {
  DOCUMENT_MIME_TYPES,
  IDENTITY_DOCUMENT_TYPES,
  MAX_DOCUMENT_BYTES,
  PROVIDER_DOCUMENT_TYPES,
  ProviderDocumentType,
  ProviderType,
  isAcceptedDocumentMime,
  isIdentityDocument,
  missingDocumentsFor,
  requiredDocumentsFor,
} from "../provider-enums";

describe("identity documents", () => {
  it("accepts any one of the three, not all three", () => {
    // A resident foreigner holds a DIRE and no national ID. Requiring the BI
    // would be telling that person they cannot join.
    for (const doc of IDENTITY_DOCUMENT_TYPES) {
      expect(missingDocumentsFor(ProviderType.Individual, [doc, ProviderDocumentType.TaxNumber]))
        .toEqual([]);
    }
  });

  it("asks for one when none has been sent", () => {
    const missing = missingDocumentsFor(ProviderType.Individual, [
      ProviderDocumentType.TaxNumber,
    ]);
    expect(missing).toHaveLength(1);
    expect(isIdentityDocument(missing[0]!)).toBe(true);
  });

  it("knows which types prove identity and which do not", () => {
    expect(isIdentityDocument(ProviderDocumentType.Dire)).toBe(true);
    expect(isIdentityDocument(ProviderDocumentType.TaxNumber)).toBe(false);
    expect(isIdentityDocument(ProviderDocumentType.BusinessLicence)).toBe(false);
  });
});

describe("what each provider type must produce", () => {
  it("asks a person for a tax number and nothing about a company", () => {
    // A person can trade as themselves. Demanding an alvará of a plumber would
    // be demanding a licence their trade does not have.
    const required = requiredDocumentsFor(ProviderType.Individual);
    expect(required).toContain(ProviderDocumentType.TaxNumber);
    expect(required).not.toContain(ProviderDocumentType.BusinessLicence);
    expect(required).not.toContain(ProviderDocumentType.CommercialRegistry);
  });

  it("asks an establishment to prove the business exists", () => {
    // A company cannot trade as nobody, so it proves it is registered and
    // licensed on top of who its owner is.
    const required = requiredDocumentsFor(ProviderType.Organization);
    expect(required).toEqual(
      expect.arrayContaining([
        ProviderDocumentType.TaxNumber,
        ProviderDocumentType.BusinessLicence,
        ProviderDocumentType.CommercialRegistry,
      ]),
    );
  });

  it("lists everything still outstanding, not just the first", () => {
    // A screen that reveals one requirement at a time makes the process feel
    // endless. The caller renders them all at once.
    const missing = missingDocumentsFor(ProviderType.Organization, []);
    expect(missing).toHaveLength(4);
  });

  it("is satisfied only when an establishment has sent all four", () => {
    const all = [
      ProviderDocumentType.Passport,
      ProviderDocumentType.TaxNumber,
      ProviderDocumentType.BusinessLicence,
      ProviderDocumentType.CommercialRegistry,
    ];
    expect(missingDocumentsFor(ProviderType.Organization, all)).toEqual([]);
    expect(missingDocumentsFor(ProviderType.Organization, all.slice(0, 3))).toEqual([
      ProviderDocumentType.CommercialRegistry,
    ]);
  });

  it("covers every provider type", () => {
    // A type with no entry would throw when the wizard read it, and the throw
    // would land in a form somebody was halfway through.
    for (const type of Object.values(ProviderType)) {
      expect(Array.isArray(requiredDocumentsFor(type))).toBe(true);
    }
  });
});

describe("what may be uploaded", () => {
  it("takes photographs and PDFs, and refuses everything else", () => {
    // This is an upload from the public internet into storage we serve back.
    // Every extra format is one nobody needs and a parser nobody audited.
    for (const mime of DOCUMENT_MIME_TYPES) expect(isAcceptedDocumentMime(mime)).toBe(true);
    for (const mime of [
      "image/svg+xml",
      "text/html",
      "application/zip",
      "application/octet-stream",
      "",
    ]) {
      expect(isAcceptedDocumentMime(mime)).toBe(false);
    }
  });

  it("refuses SVG in particular", () => {
    // An SVG is a document that can carry script, and it is the one image type
    // that turns an upload into a stored-XSS vector.
    expect(isAcceptedDocumentMime("image/svg+xml")).toBe(false);
  });

  it("leaves room for a phone photograph several times over", () => {
    expect(MAX_DOCUMENT_BYTES).toBeGreaterThanOrEqual(5 * 1024 * 1024);
  });
});

describe("the type list", () => {
  it("has no duplicates", () => {
    expect(new Set(PROVIDER_DOCUMENT_TYPES).size).toBe(PROVIDER_DOCUMENT_TYPES.length);
  });
});
