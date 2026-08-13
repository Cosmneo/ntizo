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
 * One page of providers.
 *
 * A total, not a cursor — unlike `servicePageReadModel`. The directory prints
 * "12 businesses found" above a filter panel, and a count is the feedback that
 * says whether the filter just applied did anything. A service browse has no
 * such line and loads as it scrolls, which is why the two differ.
 */
export const providerPageReadModel = z.object({
  items: z.array(providerPublicReadModel),
  total: z.number().int().min(0),
});

export type ProviderPageDTO = z.infer<typeof providerPageReadModel>;
