import type { ProviderDocumentType, ProviderType } from "@ntizo/shared";

/**
 * What the wizard is collecting, before any of it is sent.
 *
 * Flat and all-strings on purpose: it round-trips through `sessionStorage`
 * between screens, and a shape with dates or nested objects would need a
 * bespoke revive step for no gain. The type is the one exception — it is the
 * first answer and it decides what the later screens ask.
 */
export interface ProviderDraft {
  type: ProviderType | "";
  name: string;
  description: string;
  country: string;
  city: string;
  district: string;
  street: string;
  postalCode: string;
  /**
   * How to find the place, in words.
   *
   * Not decoration in Mozambique: plenty of addresses are not on a numbered
   * street, and "casa azul depois da bomba da Petromoc" is how a customer
   * actually arrives. A structured address alone would make the field unusable
   * in the market this launches in.
   */
  directions: string;
  /** What the provider will be paid through. Empty until phase 2. */
  payoutType: string;
  payoutIdentifier: string;
}

export const EMPTY_DRAFT: ProviderDraft = {
  type: "",
  name: "",
  description: "",
  // Mozambique is the launch market, so it is the answer for almost everyone.
  // Prefilled rather than left blank — a required field whose answer we can
  // guess correctly is a field we should not be asking cold.
  country: "MZ",
  city: "",
  district: "",
  street: "",
  postalCode: "",
  directions: "",
  payoutType: "",
  payoutIdentifier: "",
};

const STORAGE_KEY = "ntizo.onboarding.draft";

/**
 * Rebuilds a draft from whatever `sessionStorage` holds.
 *
 * Every field is checked rather than trusted. The stored value survives a
 * reload, a deploy and a schema change, so it is untrusted input in the same
 * sense a query string is — an old draft missing a field that is now required
 * would otherwise reach the form as `undefined` and render an uncontrolled
 * input that React then refuses to control.
 */
export function coerceDraft(raw: unknown): ProviderDraft {
  if (!raw || typeof raw !== "object") return { ...EMPTY_DRAFT };
  const source = raw as Record<string, unknown>;
  const out = { ...EMPTY_DRAFT };
  for (const key of Object.keys(EMPTY_DRAFT) as Array<keyof ProviderDraft>) {
    const value = source[key];
    if (typeof value === "string") out[key] = value as never;
  }
  // A type outside the two we know is not a type. Restoring one would put the
  // wizard on a branch that does not exist.
  if (out.type !== "individual" && out.type !== "organization") out.type = "";
  return out;
}

export function readDraft(): ProviderDraft {
  if (typeof sessionStorage === "undefined") return { ...EMPTY_DRAFT };
  try {
    return coerceDraft(JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null"));
  } catch {
    return { ...EMPTY_DRAFT };
  }
}

export function writeDraft(draft: ProviderDraft): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Private browsing, a full quota. Losing the draft on reload is worse than
    // nothing but far better than the wizard throwing mid-answer.
  }
}

export function clearDraft(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* see writeDraft */
  }
}

/**
 * The URL-safe name the provider is found by.
 *
 * Derived rather than asked for. A slug is a technical artefact and asking a
 * plumber to invent one is asking them to do the database's job; they can
 * change it later from settings.
 */
export function slugFrom(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * A document the provider has picked but not yet sent.
 *
 * Metadata only — the bytes stay in the `File` the viewmodel holds until there
 * is somewhere to put them. Here rather than beside the component that renders
 * it because the viewmodel needs the shape too, and a type that crosses that
 * line belongs to neither side of it.
 */
export interface DocumentUpload {
  type: ProviderDocumentType;
  fileName: string;
  size: number;
}
