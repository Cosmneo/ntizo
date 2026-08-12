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
});

export type ProviderPublicDTO = z.infer<typeof providerPublicReadModel>;
