import {
  LOCALES,
  type Locale,
  type ServiceBookingMode,
  type ServicePricingMode,
  type ServiceStatus,
} from "@ntizo/shared";

export interface ServiceTranslation {
  locale: Locale;
  name: string;
  description: string | null;
}

export interface ServiceOption {
  id: string;
  pricingMode: ServicePricingMode;
  amountMinor: number;
  currency: string;
  durationMinutes: number | null;
  minMinutes: number | null;
  isDefault: boolean;
  isActive: boolean;
}

export interface ProviderService {
  id: string;
  categoryCode: string;
  sourceLocale: Locale;
  bookingMode: ServiceBookingMode;
  status: ServiceStatus;
  imageUrls: string[];
  translations: ServiceTranslation[];
  options: ServiceOption[];
}

export const TOTAL_LOCALES = LOCALES.length;

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

/**
 * The price to lead an option with: what a fixed job costs, or what an hour
 * of an hourly one costs.
 *
 * The division by 100 happens here and only here — every other layer carries
 * `amountMinor` as an integer. The two modes are made to read differently
 * ("300,00 MTn" against "250,00 MTn / h") rather than alike, because a
 * customer who mistakes an hourly rate for the whole job's price is a
 * dispute, not a UI nitpick.
 */
export function formatOptionPrice(option: ServiceOption, locale: string): string {
  const amount = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: option.currency,
  }).format(option.amountMinor / 100);
  return option.pricingMode === "hourly" ? `${amount} / h` : amount;
}

export type { Locale, ServiceBookingMode, ServicePricingMode, ServiceStatus };
