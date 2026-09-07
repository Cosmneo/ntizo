import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ChevronRight, Star } from "lucide-react";
import { Skeleton } from "@ntizo/frontend-ui";
import { initialsOf } from "@/shared/domain/initials";
import { useFeaturedReviews } from "@/features/landing/viewmodel/use-featured-reviews";
import { useLocale } from "@/features/landing/viewmodel/use-locale";
import { SectionHead } from "@/features/landing/ui/section-head";

/** How many reviews the section draws. */
export const LANDING_STORIES = 3;

/**
 * What customers wrote, set as type.
 *
 * Nothing here is translated and nothing should be: a review is what one
 * person wrote, in the language they wrote it, and rendering it in the
 * reader's language would make it no longer a quotation. Only the month is
 * formatted, from `createdAt`, in the reader's locale.
 *
 * **The alignment is the feature.** Reviews are different lengths, so the
 * reviewer block takes `margin-top: auto` inside a flex column and every
 * column is stretched by the grid — the reviewer's row and the business row
 * land on one baseline across all three however long the quote runs. Three
 * footers at three different heights is what made the block this replaces
 * read as unfinished.
 */
export function CustomerReviews() {
  const { t } = useTranslation("landing"); // t:CustomerReviews
  const locale = useLocale();
  const { data, isLoading } = useFeaturedReviews(LANDING_STORIES);
  const stories = data ?? [];

  if (!isLoading && stories.length === 0) return null;

  const month = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" });

  return (
    <section className="page-shell pt-14">
      <SectionHead title={t("home.storiesTitle")} blurb={t("home.storiesBlurb")} />
      <ul className="grid items-stretch gap-9 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading
          ? Array.from({ length: LANDING_STORIES }, (_, i) => (
              <li key={i} className="border-t border-[var(--color-border)] pt-5">
                <Skeleton className="h-[15px] w-20" />
                <Skeleton className="mt-3 h-[17px] w-full" />
                <Skeleton className="mt-1.5 h-[17px] w-2/3" />
              </li>
            ))
          : stories.map((s) => (
              <li
                key={s.id}
                className="flex flex-col border-t border-[var(--color-border)] pt-5"
              >
                <span
                  className="mb-3 flex gap-0.5"
                  role="img"
                  aria-label={t("storyRating", { rating: s.rating })}
                >
                  {Array.from({ length: 5 }, (_, star) => (
                    <Star
                      key={star}
                      aria-hidden="true"
                      className={
                        star < s.rating
                          ? "h-[15px] w-[15px] fill-[var(--color-warning)] text-[var(--color-warning)]"
                          : "h-[15px] w-[15px] text-[color-mix(in_srgb,var(--color-muted-foreground)_40%,transparent)]"
                      }
                    />
                  ))}
                </span>
                <blockquote className="line-clamp-4 text-[17.5px] leading-[1.48] tracking-[-0.006em]">
                  {s.comment}
                </blockquote>
                {/* `margin-top: auto` as an inline style, not a class: the test
                    asserts the declared value, because jsdom does no layout and
                    a class name proves nothing about where this lands. */}
                <div
                  data-testid="review-footer"
                  style={{ marginTop: "auto" }}
                  className="grid grid-cols-[36px_minmax(0,1fr)] items-center gap-3 pt-[18px]"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--color-muted)] text-[12.5px] font-bold text-[var(--color-headline)]">
                    {s.authorName ? initialsOf(s.authorName) : "—"}
                  </span>
                  <span className="min-w-0">
                    <b className="block truncate text-sm font-semibold">
                      {s.authorName ?? t("storyAnonymous")}
                    </b>
                    <span className="text-[12.5px] text-[var(--color-muted-foreground)]">
                      {month.format(new Date(s.createdAt))}
                    </span>
                  </span>
                </div>
                <Link
                  to="/providers/$slug"
                  params={{ slug: s.providerSlug }}
                  className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--color-border)] pt-3.5 text-[13.5px] font-semibold hover:underline hover:underline-offset-[3px]"
                >
                  <span className="truncate">{s.providerName}</span>
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-[var(--color-headline)]"
                    strokeWidth={2.2}
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
      </ul>
    </section>
  );
}
