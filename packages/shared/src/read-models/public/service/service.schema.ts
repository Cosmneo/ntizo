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
  /**
   * Whether the business is a person or an establishment.
   *
   * Already public on `providerPublicReadModel`, so publishing it here is not
   * a new disclosure — it is the same fact reaching the card that names the
   * business, instead of the card having to fetch each provider to learn it.
   */
  providerType: z.enum(["individual", "organization"]),
  categoryCode: z.string(),
  /**
   * The category's name in the reader's language.
   *
   * Resolved on the server for the same reason `name` is: a code is not
   * something to put on a card, and resolving it in the client would mean
   * every client loading every category to translate one word — or, worse,
   * translating only the categories that happened to be on screen and
   * showing a raw code for the rest.
   */
  categoryName: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  locationType: z.string(),
  bookingMode: z.string(),
  imageUrls: z.array(z.string()),
  defaultOption: servicePublicOptionReadModel.nullable(),
  /**
   * The cheapest active option's amount, in minor units.
   *
   * What the card leads with, and what the price filter matches — one number
   * for both, so a service can never be hidden by a bound it visibly satisfies.
   * Null on a `quote` service, which has nothing priced to be cheapest.
   */
  fromAmountMinor: z.number().int().nullable(),
  /**
   * How many active options the service carries.
   *
   * The card says "from" only above one. With a single option there is nothing
   * to be *from* — "from 500 MZN" when 500 is the only price it can ever be
   * invites the reader to expect a cheaper one that does not exist.
   */
  optionCount: z.number().int(),
  /** True when `name`/`description` came from the fallback locale, not the one asked for. */
  isFallback: z.boolean(),
});

export type ServiceDTO = z.infer<typeof serviceReadModel>;

/**
 * One page of services.
 *
 * Both a cursor and a total, which the doc comment here used to argue against.
 * The argument was sound while the browse only stepped forward — "is there
 * more and from where" is all a next link needs. It stopped being sound when
 * the page began stating how many results there are and offering numbered
 * pages: `items.length` reports the page size, not the search, and told
 * somebody with 40 matches that they had 24.
 *
 * `total` counts what the *filters* match. The projection then drops rows it
 * cannot render — a service whose translations resolve to nothing in any
 * locale — so across every page the rows shown can be very slightly fewer than
 * `total` claims. That is the honest trade: the alternative is counting by
 * fetching and mapping the whole result set on every request.
 */
export const servicePageReadModel = z.object({
  items: z.array(serviceReadModel),
  nextOffset: z.number().int().nullable(),
  total: z.number().int().min(0),
});

export type ServicePageDTO = z.infer<typeof servicePageReadModel>;

/**
 * One package a customer can choose, on the service's own page.
 *
 * Distinct from `servicePublicOptionReadModel`, which is the single option a
 * *card* shows: this one carries an id (the chooser needs something to select)
 * and a name (a list of three prices with no labels is not a choice).
 */
export const serviceDetailOptionReadModel = z.object({
  id: z.string().min(1),
  /** Already resolved into the reader's language. */
  name: z.string(),
  amountMinor: z.number().int(),
  currency: z.string(),
  durationMinutes: z.number().int().nullable(),
  minMinutes: z.number().int().nullable(),
  stepMinutes: z.number().int().nullable(),
  pricingMode: z.string(),
  isDefault: z.boolean(),
});

/**
 * Somebody who performs this service.
 *
 * First name and photograph, never a surname: enough for a customer to know
 * who is coming, and the narrowest disclosure that achieves it. These are
 * employees, not account holders — publishing them is a one-way decision taken
 * on 2026-08-13, reversing the earlier choice `member-picker.tsx` documents.
 */
export const servicePerformerReadModel = z.object({
  /** A `provider_member.id` — the same id `availability.forService` speaks. */
  id: z.string().min(1),
  firstName: z.string(),
  avatarUrl: z.string().nullable(),
});

/**
 * One service, in full, for its own page.
 *
 * A separate model from `serviceReadModel` rather than more fields on it: the
 * browse asks for twenty-four services at a time and wants one price each.
 * Sending every option of every card to save a schema would make the list page
 * pay for the detail page's data.
 */
export const serviceDetailReadModel = z.object({
  id: z.string().min(1),
  providerId: z.string(),
  providerName: z.string(),
  providerSlug: z.string(),
  providerType: z.enum(["individual", "organization"]),
  providerLogoUrl: z.string().nullable(),
  providerCity: z.string().nullable(),
  providerDistrict: z.string().nullable(),
  categoryCode: z.string(),
  categoryName: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  locationType: z.string(),
  bookingMode: z.string(),
  imageUrls: z.array(z.string()),
  /** Every active option, cheapest first. Empty for a `quote` service. */
  options: z.array(serviceDetailOptionReadModel),
  performers: z.array(servicePerformerReadModel),
  isFallback: z.boolean(),
});

export type ServiceDetailOptionDTO = z.infer<typeof serviceDetailOptionReadModel>;
export type ServicePerformerDTO = z.infer<typeof servicePerformerReadModel>;
export type ServiceDetailDTO = z.infer<typeof serviceDetailReadModel>;
