import {
  LOCALES,
  type Locale,
  type ServiceBookingMode,
  type ServiceLocationType,
  type ServicePricingMode,
  type ServiceStatus,
} from "@ntizo/shared";

export interface ServiceTranslation {
  locale: Locale;
  name: string;
  description: string | null;
}

/** An option's own name, per language — the same per-field translation shape as the service's. */
export interface OptionTranslation {
  locale: Locale;
  name: string;
}

export interface ServiceOption {
  id: string;
  pricingMode: ServicePricingMode;
  amountMinor: number;
  currency: string;
  durationMinutes: number | null;
  minMinutes: number | null;
  /** Null for a fixed option — only an hourly one is booked in steps. */
  stepMinutes: number | null;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
  translations: OptionTranslation[];
}

export interface ProviderService {
  id: string;
  /** The write side's key for the category — `categoryCode` is what the reader sees, this is what a save call sends back. */
  categoryId: string;
  categoryCode: string;
  sourceLocale: Locale;
  locationType: ServiceLocationType;
  bookingMode: ServiceBookingMode;
  status: ServiceStatus;
  imageUrls: string[];
  /** The stored keys. `imageUrls` is for showing; these are what a save writes back. */
  imageKeys: string[];
  translations: ServiceTranslation[];
  options: ServiceOption[];
  /** `provider_member.id`s who perform this service. Empty for a draft nobody has been assigned to yet. */
  memberIds: string[];
}

export const TOTAL_LOCALES = LOCALES.length;

/**
 * The badge colour for each status.
 *
 * Shared between the list and the editor's own status control so the same
 * status never reads as two different colours depending on which screen
 * shows it.
 */
export const STATUS_TONE: Record<ServiceStatus, "success" | "warning" | "neutral"> = {
  draft: "warning",
  published: "success",
  archived: "neutral",
};

/**
 * The name to show the provider who owns this service.
 *
 * Their own reading language first. Failing that, the language the provider
 * actually wrote the service in — `sourceLocale` — rather than the platform
 * default, because that is the one language every service is guaranteed to
 * have; a service authored entirely in French has no Portuguese to fall back
 * to, and showing one would be showing nothing.
 */
export function ownerName(service: ProviderService, locale: string): string {
  const exact = service.translations.find((t) => t.locale === locale);
  if (exact) return exact.name;
  const source = service.translations.find(
    (t) => t.locale === service.sourceLocale,
  );
  return source?.name ?? service.translations[0]?.name ?? "";
}

/**
 * How many of the platform's languages this service has a name in.
 *
 * Translations come back unresolved on purpose (see the read model): the
 * provider's job on this screen is to see which languages are filled in, and
 * a name resolved through fallback would hide exactly that — a service with
 * no English would show its Portuguese here and read as finished.
 */
export function translatedCount(service: ProviderService): number {
  return service.translations.filter((t) => t.name.trim().length > 0).length;
}

/**
 * The option to lead the row with: the one marked default, among the options
 * still bookable.
 *
 * Filtered to active options first — a deactivated option can still be
 * flagged `isDefault` (deactivating one never reassigns the flag), and
 * leading with a price nobody can actually book would be showing a price
 * that lies. Falls back to the first option of whichever pool is non-empty,
 * so a service with no default still shows something.
 */
export function defaultOption(service: ProviderService): ServiceOption | null {
  const active = service.options.filter((o) => o.isActive);
  const pool = active.length > 0 ? active : service.options;
  return pool.find((o) => o.isDefault) ?? pool[0] ?? null;
}

/** What the provider's list should show in a service's price cell. */
export type PriceCell =
  | { kind: "quote" }
  | { kind: "priced"; option: ServiceOption }
  | { kind: "none" };

/**
 * Which price cell a service's row gets, on the provider's own list.
 *
 * Keyed off `bookingMode` first, never off whether a default option exists —
 * a `priced` service between being created and getting its first option is a
 * state the form deliberately produces, and reading `quote`'s "By quote"
 * there would tell the provider their fixed-price service is something it is
 * not. `quote` short-circuits before `defaultOption` even runs, since a quote
 * service is never expected to carry one.
 */
export function priceCell(service: ProviderService): PriceCell {
  if (service.bookingMode === "quote") return { kind: "quote" };
  const option = defaultOption(service);
  return option ? { kind: "priced", option } : { kind: "none" };
}

/**
 * The price to lead an option with: what a fixed job costs, or what an hour
 * of an hourly one costs.
 *
 * The division by 100 happens here, for display, and in `optionDraftFrom`,
 * for editing — every other layer carries `amountMinor` as an integer. The
 * two modes are made to read differently ("300,00 MTn" against "250,00 MTn /
 * h") rather than alike, because a customer who mistakes an hourly rate for
 * the whole job's price is a dispute, not a UI nitpick.
 */
export function formatOptionPrice(option: ServiceOption, locale: string): string {
  const amount = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: option.currency,
  }).format(option.amountMinor / 100);
  return option.pricingMode === "hourly" ? `${amount} / h` : amount;
}

/**
 * Every locale, the source one first — the order the translations sheet
 * lists its boxes in.
 *
 * The language the provider actually wrote the service in leads because it
 * is the one language every service is guaranteed to have; the rest follow
 * in the platform's own fixed order, since there is no other principled way
 * to rank seven optional languages against each other.
 */
export function orderedLocales(sourceLocale: Locale): Locale[] {
  return [sourceLocale, ...LOCALES.filter((l) => l !== sourceLocale)];
}

/**
 * The name to head an option's block with, in the translations sheet.
 *
 * The source locale's own name, not the reader's — this labels which option
 * the block of language boxes underneath belongs to, and a name that quietly
 * resolved through the reader's own language would make that unclear the one
 * time it actually differs from the source.
 */
export function optionSourceName(option: ServiceOption, sourceLocale: Locale): string {
  return (
    option.translations.find((t) => t.locale === sourceLocale)?.name ??
    option.translations[0]?.name ??
    ""
  );
}

export type { Locale, ServiceBookingMode, ServiceLocationType, ServicePricingMode, ServiceStatus };
