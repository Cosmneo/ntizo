import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Star } from "lucide-react";
import { Button, cn } from "@ntizo/frontend-ui";
import { useProviderReviews } from "@/features/directory/viewmodel/use-directory";
import { RatingStars } from "@/features/directory/ui/rating-stars";

/** The five bars, best first — the order every review summary on the web is read in. */
const BARS = ["five", "four", "three", "two", "one"] as const;
const SCORE_OF: Record<(typeof BARS)[number], number> = {
  five: 5, four: 4, three: 3, two: 2, one: 1,
};

/** The `ReviewByProviderInput` GraphQL input's own ceiling (see the `REVIEWS`
 *  query in `directory.repository.ts`) — repeated here as a literal, rather
 *  than imported, so the "see all" button's promise is checkable by reading
 *  this file alone. */
const REVIEWS_CAP = 50;

/**
 * The summary panel's own five-star row, drawn directly instead of through
 * `RatingStars`: that component always prints the score and the count as text
 * beside its stars, and this panel already prints both once each — the score
 * as the headline number above, the count in the caption below. Hiding
 * `RatingStars`'s copies with CSS would still leave them in the DOM as a
 * second, redundant "4.8", so the fix is a row that only ever draws stars.
 */
function AverageStars({ average }: { average: number }) {
  return (
    <span aria-hidden="true" className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((position) => (
        <Star
          key={position}
          className={cn(
            "h-4 w-4",
            // The same quarter-star tolerance `RatingStars` uses, so 4.8 fills
            // its fifth star here too rather than reading as a rounded-down 4.
            average >= position - 0.25
              ? "fill-[var(--color-warning)] text-[var(--color-warning)]"
              : "text-[color-mix(in_srgb,var(--color-muted-foreground)_40%,transparent)]",
          )}
        />
      ))}
    </span>
  );
}

/**
 * What customers said about this business.
 *
 * The score alone is not the evidence — 4.8 from three people and 4.8 from two
 * hundred are different claims, and a reader deciding whether to let somebody
 * into their house wants the words. So the count leads, the distribution says
 * whether the average is carried by a few outliers, and the comments follow.
 *
 * Renders nothing at all when there are none. An empty "Reviews (0)" heading
 * over a blank space is a hole in the page that says the business is untested
 * in the least generous way possible; the card in the directory has already
 * said "no reviews yet" in words, which is enough.
 *
 * "See all reviews" raises the query's `limit` rather than paging it. The
 * `ReviewByProviderInput` GraphQL input caps that field at 50, so 50 is
 * the whole of what it can ever hand back; a "load more" built to keep
 * requesting past that could never reach the end, which makes it a control
 * that lies about how much more there is. Raising the limit and re-fetching
 * is the honest version of the same button, and it is why the local `limit`
 * state below only ever takes the values `undefined` (the hook's default) and
 * `REVIEWS_CAP` — there is no third page to ask for.
 */
export function ProviderReviews({ providerId }: { providerId: string }) {
  const { t, i18n } = useTranslation("directory");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const [limit, setLimit] = useState<number | undefined>(undefined);
  const data = useProviderReviews(providerId, limit);

  if (!data || data.summary.count === 0) return null;

  const { summary, reviews } = data;
  const score = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(summary.average ?? 0);

  return (
    <section className="mt-12">
      <h2 className="type-h2">{t("reviewsHeading", { count: summary.count })}</h2>

      {/* One column below `sm`, two above — the same breakpoint the section
          this replaced used. The score's own column is `auto`-sized by a
          long aria label, so on a 360px phone (Mozambique is a mobile-first
          market) a two-column layout would squeeze the histogram's label,
          bar and count into what is left of a ~312px shell. `items-center`
          is scoped to `sm:` too, so the stacked score does not float
          against a histogram it is no longer beside. */}
      <div className="mt-4 grid grid-cols-1 gap-6 rounded-[var(--radius-card)] border bg-[var(--color-muted)] px-5 py-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-11 sm:px-7 sm:py-6">
        <div className="grid justify-items-center gap-2">
          <p className="font-display text-[52px] font-semibold leading-none tabular-nums">
            {score}
          </p>
          <AverageStars average={summary.average ?? 0} />
          <p className="type-caption text-[var(--color-muted-foreground)]">
            {t("providerRatingLabel", { score, count: summary.count })}
          </p>
        </div>

        {/* The distribution, so an average can be weighed rather than trusted:
            4.5 from all fours and 4.5 from half fives and half threes are the
            same number describing two different businesses. */}
        <div className="grid gap-1.5">
          {BARS.map((bar) => {
            const n = summary.histogram[bar];
            const share = summary.count === 0 ? 0 : (n / summary.count) * 100;
            return (
              <div key={bar} className="flex items-center gap-2">
                <span className="type-caption inline-flex w-8 shrink-0 items-center gap-0.5 tabular-nums text-[var(--color-muted-foreground)]">
                  {SCORE_OF[bar]}
                  <Star className="h-3 w-3 fill-current" aria-hidden="true" />
                </span>
                <span
                  className="h-[7px] flex-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--color-foreground)_10%,transparent)]"
                  // The bar is decoration for the number beside it; a screen
                  // reader gets "4 stars, 12" from the row, not a percentage.
                  aria-hidden="true"
                >
                  <span
                    // Foreground, not warning: the stars above are the only
                    // gold on the page, so a bar reads as quantity, not as a
                    // second, competing rating.
                    className="block h-full rounded-full bg-[var(--color-foreground)]"
                    style={{ width: `${share}%` }}
                  />
                </span>
                <span className="type-caption w-8 shrink-0 text-right tabular-nums text-[var(--color-muted-foreground)]">
                  {n}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <ul className="mt-6">
        {reviews.map((review) => (
          <li key={review.id} className="border-t border-[var(--color-border)] py-6">
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3">
              <span
                aria-hidden="true"
                className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full bg-[var(--color-muted)] text-[13px] font-semibold text-[var(--color-muted-foreground)]"
              >
                {initials(review.authorName)}
              </span>
              <div className="grid gap-0.5">
                <p className="type-body-medium font-semibold">
                  {/* Somebody who set no display name is "a customer", never
                      their email and never their id: this page is public, and
                      they did not agree to appear under either. */}
                  {review.authorName ?? t("reviewAnonymous")}
                </p>
                <time
                  dateTime={review.createdAt}
                  className="type-caption text-[var(--color-muted-foreground)]"
                >
                  {formatDate(review.createdAt, locale)}
                </time>
              </div>
              <RatingStars average={review.rating} count={1} className="[&>span:last-child]:hidden" />
            </div>
            {review.comment && (
              <p className="type-body mt-2.5 whitespace-pre-line">{review.comment}</p>
            )}
          </li>
        ))}
      </ul>

      {summary.count > reviews.length && (
        <div className="mt-4 grid gap-3 justify-items-start">
          {reviews.length < REVIEWS_CAP && (
            <Button type="button" variant="outline" onClick={() => setLimit(REVIEWS_CAP)}>
              {t("reviewsSeeAll")}
            </Button>
          )}
          {/* Said plainly rather than with a "load more" that keeps offering
              past 50: the read model has nothing further to give, so once
              `reviews.length` reaches its cap this sentence is the honest end
              of the story, not a control promising a next page. */}
          <p className="type-caption text-[var(--color-muted-foreground)]">
            {t("reviewsShowing", { shown: reviews.length, total: summary.count })}
          </p>
        </div>
      )}
    </section>
  );
}

function initials(name: string | null): string {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => [...w][0] ?? "")
    .join("")
    .toUpperCase();
}

/** An ISO instant as a date in the reader's language — a review is dated, not timed. */
function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}
