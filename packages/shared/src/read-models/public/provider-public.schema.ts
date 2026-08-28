import { z } from "zod";

/**
 * The public view of a provider — what an anonymous visitor and a search
 * crawler may see.
 *
 * Deliberately narrower than `ProviderDetailDTO`. Absent, and absent on
 * purpose:
 *
 * - `ownerUserId` — links a business to a person; nothing public needs it.
 * - `addressStreet`, `addressPostalCode`, `addressLat`, `addressLng` — the
 *   precise location of a provider who may work from home. City and district
 *   are enough to find and rank a listing; the exact address belongs behind a
 *   booking, not in a crawlable page.
 * - `members`, `invites` — the private detail projection's payload, and the
 *   reason that projection requires membership.
 *
 * Adding a field here publishes it to everyone, forever, including anything
 * that has already crawled the page. Treat additions as one-way.
 *
 * `logoUrl` is such an addition: a service card with no photo of its own
 * falls back to it, so a card never has to render with nothing to show at
 * all. Resolved from `provider.logoKey` the same way `ServiceDTO.imageUrls`
 * is — a stored key survives the bucket moving; a stored URL would not.
 */
export const providerPublicReadModel = z.object({
  id: z.string().min(1),
  name: z.string(),
  slug: z.string(),
  type: z.enum(["individual", "organization"]),
  description: z.string().nullable(),
  city: z.string().nullable(),
  district: z.string().nullable(),
  country: z.string().nullable(),
  logoUrl: z.string().nullable(),

  /**
   * The business's own photographs of its work, in the order it arranged them.
   *
   * A one-way publication like `logoUrl`, and the same reasoning applies: these
   * are pictures the provider chose to show customers, resolved from stored
   * keys so the bucket can move without rewriting a row. Empty for a business
   * that has uploaded none — which is most of them, and the page must read as
   * finished without it rather than leaving a gap where a gallery would go.
   */
  photoUrls: z.array(z.string()),

  /**
   * Whether the platform has accepted at least one of this business's
   * documents.
   *
   * Not `status === "active"`, which every listed provider is by definition —
   * a badge that is always lit says nothing. This is the document check an
   * administrator actually performed, so a business that has passed it is
   * distinguishable from one that merely registered.
   *
   * Deliberately a boolean and not the document list: which papers somebody
   * filed is nobody's business but theirs and the platform's.
   */
  verified: z.boolean(),

  /**
   * The average of every published review, to one decimal — null when there
   * are none.
   *
   * Null rather than 0, and the distinction is the whole point: zero is a score
   * a person could have given, and rendering it for a business nobody has
   * reviewed tells every visitor it is the worst on the platform.
   */
  ratingAverage: z.number().nullable(),
  reviewCount: z.number().int().min(0),

  /**
   * The trades this business actually publishes services in, in the reader's
   * language.
   *
   * Derived from its published services rather than declared on the provider:
   * a business that says it does plumbing and lists no plumbing service would
   * otherwise appear under a filter that returns nothing it can sell.
   */
  categories: z.array(z.object({ code: z.string(), name: z.string() })),
  serviceCount: z.number().int().min(0),

  /**
   * The cheapest thing this business sells, in minor units — null when it
   * publishes nothing priced.
   *
   * The cheapest *active option of a published service*, which is the same
   * number the service cards print as their "from", so a provider card and the
   * services behind it can never disagree about the lowest price.
   */
  fromAmountMinor: z.number().int().nullable(),
  fromCurrency: z.string().nullable(),
});

export type ProviderPublicDTO = z.infer<typeof providerPublicReadModel>;

/**
 * One weekday's usual opening, as the business rather than as a member.
 *
 * `intervals` is the *union* of every member's rules for that weekday, already
 * merged by the projection — never `min(start)`–`max(end)`. An organization
 * running two shifts with a gap between them would otherwise publish itself as
 * open through a break it does not staff. An empty array means closed, which is
 * a fact; a missing weekday would be an absence the reader has to interpret, so
 * all seven are always present.
 */
export const weeklyHoursReadModel = z.object({
  weekday: z.number().int().min(0).max(6),
  intervals: z.array(
    z.object({
      startMinute: z.number().int().min(0).max(1440),
      endMinute: z.number().int().min(0).max(1440),
    }),
  ),
});

/**
 * A provider on their own page — the list model plus what only a detail view
 * needs.
 *
 * A separate model rather than three more fields on `providerPublicReadModel`,
 * for the reason `serviceDetailReadModel` already records: the directory asks
 * for 24 providers at a time and needs none of this. Joining every member's
 * availability 24 times to render a list of cards would make the browse pay for
 * a page it is not.
 *
 * Every field here is a one-way publication, the same as `logoUrl` and
 * `photoUrls` above.
 */
export const providerPublicDetailReadModel = providerPublicReadModel.extend({
  /**
   * The month the business joined, as `YYYY-MM` — never the day.
   *
   * The exact date somebody registered is not a thing a customer needs and not
   * a thing the business chose to publish; the month is enough to tell a
   * five-year business from a five-week one, which is the only question being
   * asked. Nullable so a future backfill can admit it does not know, rather
   * than being forced to invent a date.
   */
  memberSince: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .nullable(),

  /**
   * Where this business actually works, derived from its published services'
   * `location_type` — not from anything it declared.
   *
   * The same reasoning as `categories` above: a provider who says they travel
   * but publishes only at-provider services would otherwise appear to offer
   * something they do not sell.
   */
  serviceLocationTypes: z.array(z.string()),

  /**
   * All seven weekdays, always — enforced here, not just documented in the
   * prose above. Exactly seven entries, and `superRefine` checks the weekday
   * set covers 0–6 with no repeats: `weeklyHoursReadModel` already bounds a
   * single entry's `weekday` to 0–6, so seven entries with seven distinct
   * weekdays can only be the full week, never seven copies of Monday with
   * Sunday missing.
   */
  weeklyHours: z.array(weeklyHoursReadModel).length(7).superRefine((hours, ctx) => {
    const weekdays = new Set(hours.map((day) => day.weekday));
    if (weekdays.size !== hours.length) {
      ctx.addIssue("weeklyHours must cover each weekday 0-6 exactly once, with no repeats");
    }
  }),
});

export type WeeklyHoursDTO = z.infer<typeof weeklyHoursReadModel>;
export type ProviderPublicDetailDTO = z.infer<typeof providerPublicDetailReadModel>;

/**
 * One page of providers.
 *
 * A total with no cursor: this directory pages by a fixed page size rather
 * than scrolling further, so there is no "next" to point at. The count is
 * what lets it print "12 businesses found" above a filter panel — the
 * feedback that says whether the filter just applied did anything.
 * `servicePageReadModel` carries both for the reason given on it: that browse
 * offers numbered pages too, but still loads a page at a time as it scrolls,
 * so it needs somewhere to point *and* a count.
 */
export const providerPageReadModel = z.object({
  items: z.array(providerPublicReadModel),
  total: z.number().int().min(0),
});

export type ProviderPageDTO = z.infer<typeof providerPageReadModel>;
