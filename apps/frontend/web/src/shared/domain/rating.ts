/**
 * A review score to one decimal, in the reader's own numerals and separator —
 * "4,8" in `pt-MZ`, "4.8" in `en-US`.
 *
 * Pinned to exactly one decimal rather than left to `Intl`'s default, so a
 * business on a round 5 reads "5,0" beside one on "4,8" instead of a bare "5"
 * that looks like a different kind of number. The value is already rounded to
 * one decimal server-side — see `coerceReviewAggregate` — so this is
 * presentation only and cannot disagree with the provider's own page.
 *
 * **In `shared/domain`, not beside `formatHeadlinePrice`.** It moved here the
 * way `initialsOf` did, because the browse tile and the directory row print
 * this number too, and a `shared/components` file may import `shared/domain`
 * but never a feature's own. Left where it was, the score was written four
 * ways across the app: this function, an inline `Intl` in `rating-stars` and
 * another in `provider-reviews`, a `formatRatingScore` copy in the directory's
 * filters, and a `toFixed(1).replace(".", ",")` on the result tile that
 * printed a comma in all eight locales — so an en-US reader saw "4,7" on the
 * tile and "4.7" on the same provider's page, and a pt-MZ screen reader heard
 * "4.7 out of 5" beside a visible "4,7".
 */
export function formatRating(rating: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(rating);
}
