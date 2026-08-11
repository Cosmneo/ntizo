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
  options: ServiceOwnerOptionRow[];
  translations: ServiceOwnerTranslationRow[];
  quoteForm: ServiceOwnerQuoteFormRow | null;
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
}

export type { ServiceOwnerDTO };
