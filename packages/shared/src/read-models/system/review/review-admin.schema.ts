import { z } from "zod";

/**
 * One review as the administration screen sees it.
 *
 * Wider than the public model on purpose, because the job here is different.
 * A visitor reads a verdict; an administrator decides whether to put it on the
 * front page, and that decision needs the things the public model deliberately
 * withholds:
 *
 * - `providerName` / `providerSlug` — which business this is about. The public
 *   provider page already knows; a cross-provider list does not.
 * - `status` — the public model omits it because everything reaching it is
 *   published by construction. This list shows hidden reviews too, so that a
 *   hidden one that is still featured is visible as the contradiction it is.
 * - `featuredAt` — the state the toggle reflects, and the order the home page
 *   will use.
 *
 * Still absent, and still on purpose: `authorUserId` and `bookingId`. Featuring
 * a testimonial does not need the account behind it, and this projection is
 * read by a screen, not by an investigation.
 */
export const reviewAdminReadModel = z.object({
  id: z.string().min(1),
  providerId: z.string().min(1),
  providerName: z.string(),
  providerSlug: z.string(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().nullable(),
  authorName: z.string().nullable(),
  status: z.enum(["published", "hidden"]),
  /** ISO 8601, or null for a review nobody has featured. */
  featuredAt: z.string().nullable(),
  createdAt: z.string(),
});

export type ReviewAdminDTO = z.infer<typeof reviewAdminReadModel>;

/**
 * One page of reviews, plus how many are currently on the home page.
 *
 * `featuredCount` rides along rather than being its own query: the screen's
 * whole purpose is a bounded selection, so it has to be able to say "3 of 4"
 * beside the toggles, and a separate round trip for one integer could disagree
 * with the page it is printed next to.
 */
export const reviewAdminPageReadModel = z.object({
  items: z.array(reviewAdminReadModel),
  total: z.number().int().min(0),
  featuredCount: z.number().int().min(0),
});

export type ReviewAdminPageDTO = z.infer<typeof reviewAdminPageReadModel>;
