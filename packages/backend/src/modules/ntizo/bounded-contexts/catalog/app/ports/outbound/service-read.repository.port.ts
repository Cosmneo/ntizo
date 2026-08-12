import type { ServiceOwnerDTO } from "@ntizo/shared/read-models";

export interface ServiceOwnerOptionTranslationRow {
  locale: string;
  name: string;
}

export interface ServiceOwnerOptionRow {
  id: string;
  pricingMode: string;
  amountMinor: number;
  currency: string;
  durationMinutes: number | null;
  minMinutes: number | null;
  stepMinutes: number | null;
  isDefault: boolean;
  sortOrder: number;
  isActive: boolean;
  translations: ServiceOwnerOptionTranslationRow[];
}

export interface ServiceOwnerTranslationRow {
  locale: string;
  name: string;
  description: string | null;
}

export interface ServiceOwnerQuoteFormRow {
  responseHours: number;
  askDeadline: boolean;
  askPhotos: boolean;
  askLocation: boolean;
  intro: string | null;
}

export interface ServiceOwnerRow {
  id: string;
  providerId: string;
  categoryId: string;
  categoryCode: string;
  sourceLocale: string;
  locationType: string;
  bookingMode: string;
  status: string;
  imageKeys: string[] | null;
  sortOrder: number;
  createdAt: Date;
  bufferMinutes: number;
  slotIntervalMinutes: number;
  /** `provider_member.id`s who perform this service. */
  memberIds: string[];
  options: ServiceOwnerOptionRow[];
  translations: ServiceOwnerTranslationRow[];
  quoteForm: ServiceOwnerQuoteFormRow | null;
}

export interface ServicePublicOptionRow {
  amountMinor: number;
  currency: string;
  durationMinutes: number | null;
  minMinutes: number | null;
  stepMinutes: number | null;
  pricingMode: string;
}

export interface ServicePublicTranslationRow {
  locale: string;
  name: string;
  description: string | null;
}

export interface ServicePublicRow {
  id: string;
  providerId: string;
  providerName: string;
  /** The provider's live status, joined rather than copied — see `listPublished`. */
  providerStatus: string;
  categoryCode: string;
  status: string;
  sourceLocale: string;
  locationType: string;
  bookingMode: string;
  imageKeys: string[] | null;
  /** Null for a `quote` service, which carries no options at all. */
  defaultOption: ServicePublicOptionRow | null;
  translations: ServicePublicTranslationRow[];
}

export interface ListPublishedServicesFilter {
  categoryCode?: string | undefined;
  limit: number;
  offset: number;
}

export interface ServiceReadRepositoryPort {
  /** Every service a provider owns, every option and every translation — the provider's own screen. */
  listForProvider(providerId: string, status: string | undefined): Promise<ServiceOwnerRow[]>;
  /**
   * Whether this person may act for this workspace.
   *
   * Mirrors `ServiceRepositoryPort.isProviderMember` on the write side rather
   * than reusing it: the read handler needs this from a read-tier port
   * because the kit's `argsMapper` is synchronous, so the membership check
   * has to run from the handler body against something the read module
   * already holds.
   */
  isProviderMember(providerId: string, userId: string): Promise<boolean>;
  /**
   * Published services with their provider's current status, category code,
   * default option and every translation — the customer's browse.
   *
   * `providerStatus` is read live off the `provider` row via a join, never
   * copied onto the service — a copied status is two statuses that can
   * disagree. The projection is the one that decides what "visible" means;
   * this method's job is only to hand over the material to decide it with.
   */
  listPublished(filter: ListPublishedServicesFilter): Promise<ServicePublicRow[]>;
}

export type { ServiceOwnerDTO };
