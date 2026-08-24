import { z } from "zod";

/**
 * A city, as the address form's picker sees it.
 *
 * Reference data from the GeoNames gazetteer (CC BY 4.0), so "public" here is
 * not a judgement about what a visitor may see — none of it is anybody's. It
 * sits on the anonymous mount because it needs no session and should be
 * cacheable, not because a private version exists.
 *
 * The geographic columns of the source are not carried. The field asks which
 * city, and coordinates would be a second, unasked-for answer.
 */
export const cityPublicReadModel = z.object({
  /** GeoNames id. Stable across re-seeds, so a client may key a list on it. */
  id: z.number().int(),
  /** Display name, accents and all: "São Luís", not the folded search form. */
  name: z.string(),
  /** ISO 3166-1 alpha-2. */
  country: z.string(),
  /**
   * The country's first-level division, when the source has one.
   *
   * Present to disambiguate repeats — Brazil has several Santa Marias, and a
   * list showing the same word four times gives the user no way to choose.
   */
  admin1: z.string().nullable(),
});

export type CityPublicDTO = z.infer<typeof cityPublicReadModel>;
