import { useTranslation } from "react-i18next";
import { Star } from "lucide-react";
import { cn } from "@ntizo/frontend-ui";

/**
 * A score, its five stars and how many people gave it.
 *
 * The number leads and the stars confirm it. Stars alone make a reader count,
 * and at the size a card allows, 4.4 and 4.6 draw identically — the digits are
 * the information and the stars are what makes them recognisable as a rating.
 *
 * **A business with no reviews says so.** Leaving the space blank where every
 * other card has stars reads as a bad score rather than as no score, which is
 * the opposite of true and the one thing this component must not do. The same
 * reason `ratingAverage` is null rather than 0 all the way from the database.
 *
 * `aria-hidden` on the stars, with the whole thing labelled as a phrase: five
 * icons read out one by one are not a rating, and "4,8 out of 5, 133 reviews"
 * is what this actually says.
 */
export function RatingStars({
  average,
  count,
  className,
}: {
  average: number | null;
  count: number;
  className?: string;
}) {
  const { t, i18n } = useTranslation("directory");
  const locale = i18n.resolvedLanguage ?? i18n.language;

  if (average === null) {
    return (
      <span className={cn("type-caption text-[var(--color-muted-foreground)]", className)}>
        {t("providerNoReviews")}
      </span>
    );
  }

  // Always one decimal, in the reader's own separator: "5" beside "4,9" reads
  // as a number of something else, not as the best score in the list.
  const score = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(average);

  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      aria-label={t("providerRatingLabel", { score, count })}
    >
      <span aria-hidden="true" className="flex">
        {[1, 2, 3, 4, 5].map((position) => (
          <Star
            key={position}
            className={cn(
              "h-3.5 w-3.5",
              // A quarter of tolerance, so 4.8 fills its fifth star rather than
              // leaving a gap that reads as 4.
              average >= position - 0.25
                ? "fill-[var(--color-warning)] text-[var(--color-warning)]"
                : "text-[color-mix(in_srgb,var(--color-muted-foreground)_40%,transparent)]",
            )}
          />
        ))}
      </span>
      <b aria-hidden="true" className="type-caption font-semibold tabular-nums">
        {score}
      </b>
      <span aria-hidden="true" className="type-caption tabular-nums text-[var(--color-muted-foreground)]">
        ({count})
      </span>
    </span>
  );
}
