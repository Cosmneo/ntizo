import { useTranslation } from "react-i18next";
import { Star } from "lucide-react";
import { cn } from "@ntizo/frontend-ui";
import { useProviderReviews } from "@/features/directory/viewmodel/use-directory";
import { RatingStars } from "@/features/directory/ui/rating-stars";

/** The five bars, best first — the order every review summary on the web is read in. */
const BARS = ["five", "four", "three", "two", "one"] as const;
const SCORE_OF: Record<(typeof BARS)[number], number> = {
  five: 5, four: 4, three: 3, two: 2, one: 1,
};

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
 */
export function ProviderReviews({ providerId }: { providerId: string }) {
  const { t, i18n } = useTranslation("directory");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const data = useProviderReviews(providerId);

  if (!data || data.summary.count === 0) return null;

  const { summary, reviews } = data;
  const score = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(summary.average ?? 0);

  return (
    <section className="mt-12">
      <h2 className="type-h2">{t("reviewsHeading", { count: summary.count })}</h2>

      <div className="mt-4 grid gap-6 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-muted)] p-5 sm:grid-cols-[auto_minmax(0,20rem)] sm:items-center">
        <div className="grid justify-items-center gap-1 sm:justify-items-start">
          <p className="font-rounded text-[2.75rem] leading-none font-semibold tabular-nums">
            {score}
          </p>
          <RatingStars average={summary.average} count={summary.count} />
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
                  className="h-1.5 flex-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--color-foreground)_10%,transparent)]"
                  // The bar is decoration for the number beside it; a screen
                  // reader gets "4 stars, 12" from the row, not a percentage.
                  aria-hidden="true"
                >
                  <span
                    className="block h-full rounded-full bg-[var(--color-warning)]"
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

      <ul className="mt-5 grid gap-3">
        {reviews.map((review) => (
          <li
            key={review.id}
            className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-4"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span
                aria-hidden="true"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--color-muted)] text-[11px] font-semibold text-[var(--color-muted-foreground)]"
              >
                {initials(review.authorName)}
              </span>
              <p className="type-body-medium font-semibold">
                {/* Somebody who set no display name is "a customer", never their
                    email and never their id: this page is public, and they did
                    not agree to appear under either. */}
                {review.authorName ?? t("reviewAnonymous")}
              </p>
              <RatingStars average={review.rating} count={1} className="[&>span:last-child]:hidden" />
              <time
                dateTime={review.createdAt}
                className="type-caption ml-auto text-[var(--color-muted-foreground)]"
              >
                {formatDate(review.createdAt, locale)}
              </time>
            </div>
            {review.comment && (
              <p className="type-body mt-2.5 whitespace-pre-line">{review.comment}</p>
            )}
          </li>
        ))}
      </ul>

      {/* Said plainly rather than with a "load more" that does nothing: paging
          the reviews needs an offset this page does not carry yet, and a
          control that lies is worse than a sentence that does not. */}
      {summary.count > reviews.length && (
        <p className={cn("type-caption mt-4 text-[var(--color-muted-foreground)]")}>
          {t("reviewsShowing", { shown: reviews.length, total: summary.count })}
        </p>
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
