import { z } from "zod";

/**
 * The one priced option a customer sees on a listing card.
 *
 * Only the default, never every option a service carries — a card shows one
 * price; choosing among several is the service's own page's job. Null on a
 * `quote` service, which has no options at all: nothing is priced until the
 * provider has seen the job.
 */
export const servicePublicOptionReadModel = z.object({
  amountMinor: z.number().int(),
  currency: z.string(),
  durationMinutes: z.number().int().nullable(),
  minMinutes: z.number().int().nullable(),
  stepMinutes: z.number().int().nullable(),
  pricingMode: z.string(),
});

/**
 * A service as a customer browses it: one name, already in their language.
 *
 * Resolved on the server for the same reason `categoryReadModel` is — the
 * fallback rule belongs in one place, not in every client that reads this.
 * The fallback itself differs from a category's: `isFallback` here means the
 * name came from the *provider's own* locale (`sourceLocale`), not the
 * platform's default — a photographer writing in English must not be shown
 * in Portuguese to an Italian reader just because Portuguese is what the
 * platform speaks by default.
 */
export const serviceReadModel = z.object({
  id: z.string().min(1),
  providerId: z.string(),
  providerName: z.string(),
  /**
   * How the provider's public page is addressed.
   *
   * A browse card names a business and has to be able to reach it, and that
   * page is `/providers/$slug` — an id alone would leave the card a dead end.
   * Publishing this exposes nothing new: the slug is already that page's URL.
   */
  providerSlug: z.string(),
  categoryCode: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  locationType: z.string(),
  bookingMode: z.string(),
  imageUrls: z.array(z.string()),
  defaultOption: servicePublicOptionReadModel.nullable(),
  /** True when `name`/`description` came from the fallback locale, not the one asked for. */
  isFallback: z.boolean(),
});

export type ServiceDTO = z.infer<typeof serviceReadModel>;

/**
 * One page of services.
 *
 * `nextOffset` rather than a total, matching `categoryPageReadModel`: the
 * page that shows every service loads as it is scrolled, and what it needs to
 * know is "is there more and from where", not how many there are altogether.
 */
export const servicePageReadModel = z.object({
  items: z.array(serviceReadModel),
  nextOffset: z.number().int().nullable(),
});

export type ServicePageDTO = z.infer<typeof servicePageReadModel>;
