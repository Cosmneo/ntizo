import { ProviderType } from "./provider-type.enum";

/**
 * The documents a provider is asked for before they may trade.
 *
 * Three things are being proved, and the list is organised by which: who the
 * person is, that the business may legally operate, and — later, when the
 * catalogue exists — that they are qualified for the trade they claim. Only the
 * first two are here; the third depends on knowing a service's category, and
 * asking a plumber for an electrician's certificate is worse than asking for
 * nothing.
 *
 * Mozambican by design, because that is the launch market. `Dire` is not a
 * detail: a great many providers here are resident foreigners, and a list that
 * accepts only the national ID card excludes every one of them.
 */
export enum ProviderDocumentType {
  /** Bilhete de Identidade — the national ID card. */
  NationalId = "NATIONAL_ID",
  /** Documento de Identificação e Residência para Estrangeiros. */
  Dire = "DIRE",
  /** For a foreign national without a DIRE. */
  Passport = "PASSPORT",
  /** Número Único de Identificação Tributária. What lets us pay them and invoice. */
  TaxNumber = "TAX_NUMBER",
  /** Alvará — the municipal licence to carry on the activity. */
  BusinessLicence = "BUSINESS_LICENCE",
  /** Certidão do registo comercial, carrying the NUEL. */
  CommercialRegistry = "COMMERCIAL_REGISTRY",
}

export const PROVIDER_DOCUMENT_TYPES = Object.values(ProviderDocumentType);

/**
 * The three ways to prove identity. Exactly one is required, not all of them.
 *
 * A group rather than three separate requirements, because "send your BI"
 * addressed to someone holding a passport reads as "you cannot join".
 */
export const IDENTITY_DOCUMENT_TYPES = [
  ProviderDocumentType.NationalId,
  ProviderDocumentType.Dire,
  ProviderDocumentType.Passport,
] as const;

export function isIdentityDocument(type: ProviderDocumentType): boolean {
  return (IDENTITY_DOCUMENT_TYPES as readonly ProviderDocumentType[]).includes(type);
}

/**
 * What a provider of this type must produce, beyond one identity document.
 *
 * An individual proves who they are and that they have a tax number. An
 * establishment proves the same and that the business itself exists and is
 * licensed — a person can trade as themselves, a company cannot trade as
 * nobody.
 */
const EXTRA_REQUIRED: Readonly<Record<ProviderType, readonly ProviderDocumentType[]>> = {
  [ProviderType.Individual]: [ProviderDocumentType.TaxNumber],
  [ProviderType.Organization]: [
    ProviderDocumentType.TaxNumber,
    ProviderDocumentType.BusinessLicence,
    ProviderDocumentType.CommercialRegistry,
  ],
};

export function requiredDocumentsFor(
  type: ProviderType,
): readonly ProviderDocumentType[] {
  return EXTRA_REQUIRED[type];
}

/**
 * Whether what has been uploaded satisfies the requirements.
 *
 * One of the identity documents, plus every extra its type demands. Written as
 * a function rather than checked at each call site because three places need
 * the answer — the wizard, the provider's dashboard and the admin queue — and
 * three copies of a rule about legal documents is three chances to be wrong
 * about one.
 */
export function missingDocumentsFor(
  type: ProviderType,
  uploaded: readonly ProviderDocumentType[],
): readonly ProviderDocumentType[] {
  const held = new Set(uploaded);
  const missing: ProviderDocumentType[] = [];

  if (!IDENTITY_DOCUMENT_TYPES.some((doc) => held.has(doc))) {
    // The group stands in for the three, so the caller can say "an identity
    // document" rather than listing alternatives as if all were needed.
    missing.push(ProviderDocumentType.NationalId);
  }
  for (const doc of requiredDocumentsFor(type)) {
    if (!held.has(doc)) missing.push(doc);
  }
  return missing;
}

/** Where a document stands with the platform. */
export enum ProviderDocumentStatus {
  /** Uploaded, nobody has looked. */
  Pending = "pending",
  /** Checked and accepted. */
  Accepted = "accepted",
  /** Checked and refused — unreadable, expired, not the right document. */
  Rejected = "rejected",
  /**
   * Replaced by a newer upload of the same type.
   *
   * Kept, never deleted. This is what stops an approval migrating onto bytes
   * that arrived after it — see `provider-document.schema.ts`.
   */
  Superseded = "superseded",
}

export const PROVIDER_DOCUMENT_STATUSES = Object.values(ProviderDocumentStatus);

/**
 * What a document may be uploaded as.
 *
 * Photographs and PDFs, nothing else. The list is narrow on purpose: this is an
 * upload from the public internet into storage the platform serves back, and
 * every format beyond these is a format nobody needs and a parser nobody
 * audited.
 */
export const DOCUMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

/** 10 MB. A photograph of an ID card from any phone fits several times over. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export function isAcceptedDocumentMime(mime: string): boolean {
  return (DOCUMENT_MIME_TYPES as readonly string[]).includes(mime);
}

/**
 * Does replacing this document put the provider back in front of a reviewer?
 *
 * Yes exactly when the thing being replaced had already been approved. That is
 * the case worth catching: a real document gets the badge, and the file is then
 * swapped for a forgery that nobody ever checked. The replacement cannot
 * inherit the old approval — it arrives `Pending` like any other upload — but
 * the *provider* would otherwise stay `Active` on the strength of an approval
 * that no longer describes anything on file.
 *
 * A pending or rejected document being replaced is just someone fixing a blurry
 * photograph, and re-opening a review that never closed would only add noise.
 */
export function replacementNeedsReview(
  previous: ProviderDocumentStatus | null | undefined,
): boolean {
  return previous === ProviderDocumentStatus.Accepted;
}

/** The document that currently counts for a type: the newest not superseded. */
export function currentDocument<T extends { type: string; status: string; uploadedAt: string }>(
  documents: readonly T[],
  type: string,
): T | null {
  const live = documents
    .filter((d) => d.type === type && d.status !== ProviderDocumentStatus.Superseded)
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  return live[0] ?? null;
}
