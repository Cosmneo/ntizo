import { z } from "zod";

/**
 * A category as a customer sees it: one name, already in their language.
 *
 * Resolved on the server rather than handed over as a map of every locale. The
 * fallback rule — the reader's language, then the platform's default — is one
 * rule, and it belongs in one place; sending all eight names would put it in
 * every client that ever reads this and let them disagree about it.
 */
export const categoryReadModel = z.object({
  id: z.string().min(1),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  icon: z.string().nullable(),
  /** True when `name` came from the default locale, not the one asked for. */
  isFallback: z.boolean(),
});

export type CategoryDTO = z.infer<typeof categoryReadModel>;

/**
 * One page of categories.
 *
 * `nextOffset` rather than a total: the page that shows every category loads
 * as it is scrolled, and what it needs is "is there more and from where".
 */
export const categoryPageReadModel = z.object({
  items: z.array(categoryReadModel),
  nextOffset: z.number().int().nullable(),
});

export type CategoryPageDTO = z.infer<typeof categoryPageReadModel>;
