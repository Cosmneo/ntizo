import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Star } from "lucide-react";
import { Skeleton, cn } from "@ntizo/frontend-ui";
import { initialsOf } from "@/shared/domain/initials";
import { ScrollRail } from "@/shared/components/browse/scroll-rail";
import { TILE_TITLE_LINK_CLASS } from "@/shared/components/browse/result-tile";
import { useFeaturedReviews } from "@/features/landing/viewmodel/use-featured-reviews";
import { useLocale } from "@/features/landing/viewmodel/use-locale";
import { SectionHead } from "@/features/landing/ui/section-head";

/** How many reviews the section draws. */
export const LANDING_STORIES = 3;

/**
 * What customers wrote, on the card the rest of the page is built from.
 *
 * Nothing here is translated and nothing should be: a review is what one
 * person wrote, in the language they wrote it, and rendering it in the
 * reader's language would make it no longer a quotation. Only the month is
 * formatted, from `createdAt`, in the reader's locale.
 *
 * **This was the only section on the home page without a card.** The services
 * above it and the businesses above those are both drawn on a bordered tile —
 * a shape the client asked for here first and then asked to see everywhere —
 * while the reviews stayed bare items under a hairline, with a second hairline
 * inside each one for the business row. Two rules cut every review into three
 * bands, and the quotes this platform actually has are short enough that the
 * section ended up taller than what it said. It is a card now, filling the
 * same four slots its neighbours fill:
 *
 * - the **eyebrow** names the business, where `ServiceCard`'s names the
 *   provider. It is also the card's link, which is what moved: the business
 *   used to be a row at the very bottom behind its own rule, so the one thing
 *   a reader could act on sat furthest from the words that made them want to.
 * - the **title** is the quote. It is the reason the card exists, so it takes
 *   the weight a service's name takes on its own card — and the type is what
 *   has to carry it, since a review has no photograph and this is the one card
 *   on the page that opens with words instead of a picture.
 * - the **meta** line is the score, still drawn star by star rather than as
 *   `RatingMark`'s single number: a testimonial is read, not compared, and
 *   five marks say "somebody rated this" at a glance where "4,0" reads as a
 *   statistic.
 * - the **bottom row** is who wrote it and when.
 *
 * `p-5` rather than the `p-4` the other two cards use: a photograph gives
 * those cards their top mass for nothing, and a card made only of words has
 * to buy the same presence with its margins. The gaps are no longer this
 * section's own to pick — `ScrollRail` supplies them, which is what finally
 * lines these columns up with the rows above.
 *
 * **The alignment is still the feature.** Reviews are different lengths, so
 * the reviewer block takes `margin-top: auto` inside a flex column and every
 * card is stretched by its row — the flex rail below `sm`, the grid above it,
 * both of which stretch a child by default — so the reviewer's row lands on
 * one baseline across all three however long the quote runs. Three footers at
 * three different heights is what made the block this replaces read as
 * unfinished, and a border around each one would have made it read as broken.
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
      {/* Below `sm` this is `ScrollRail`'s sideways row, like the two sections
          above it: once the reviews are cards, three of them stacked down a
          390px screen is three full-width boxes to scroll past before the
          page continues, and the rail was already the answer the rest of the
          home page gives to exactly that.

          `cardWidth="78%"` is `VerifiedProviders`' own width rather than
          `PopularServices`' 72%. The two sections that end in three desktop
          columns should come to rest in the same rhythm on a phone, and this
          card has no photograph to give it height — a narrower card only
          spends the difference on wrapping the quote onto more lines. */}
      <ScrollRail as="ul" columns={2} cardWidth="78%" className="lg:grid-cols-3">
        {isLoading
          ? Array.from({ length: LANDING_STORIES }, (_, i) => (
              <li key={i}>
                {/* The same shape as the card it stands in for — a padded body
                    with an eyebrow, two lines of quote, a score and a bottom
                    row — so a cold load does not reflow the moment the real
                    card replaces it. The same choice `PopularServices`'
                    skeleton documents for the same reason. */}
                <div className="flex h-full flex-col rounded-[var(--radius-card)] border border-[var(--color-border)] p-5">
                  <Skeleton className="h-[15px] w-1/3" />
                  <Skeleton className="mt-2.5 h-[17px] w-full" />
                  <Skeleton className="mt-1.5 h-[17px] w-4/5" />
                  <Skeleton className="mt-3.5 h-[15px] w-[86px]" />
                  <div className="mt-[18px] grid grid-cols-[36px_minmax(0,1fr)] items-center gap-3">
                    <Skeleton className="h-9 w-9 rounded-full" />
                    <span className="grid gap-1.5">
                      <Skeleton className="h-[14px] w-2/3" />
                      <Skeleton className="h-[12px] w-1/2" />
                    </span>
                  </div>
                </div>
              </li>
            ))
          : stories.map((s) => (
              <li key={s.id}>
                {/* `group` and `relative` are what the whole-card link resolves
                    against: `TILE_TITLE_LINK_CLASS` stretches the eyebrow's
                    anchor over this box with an `::after`, so the card is one
                    tab stop leading to the business — the same construction
                    `ServiceCard` and `ProviderCard` use, rather than an anchor
                    wrapped around everything. */}
                <article className="group relative flex h-full flex-col rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)] p-5 text-[var(--color-card-foreground)]">
                  <p className="text-[12.5px] text-[var(--color-muted-foreground)]">
                    <Link
                      to="/providers/$slug"
                      params={{ slug: s.providerSlug }}
                      className={cn(
                        "font-semibold text-[var(--color-foreground)] group-hover:underline group-hover:decoration-[1.5px] group-hover:underline-offset-[3px] group-focus-within:underline",
                        TILE_TITLE_LINK_CLASS,
                      )}
                    >
                      {s.providerName}
                    </Link>
                  </p>

                  {/* Clamped at four lines, as it was before the card: the
                      cards in a row are compared with each other, and one
                      review running to nine lines beside two of three is the
                      ragged column the grid's `items-stretch` exists to
                      prevent. */}
                  <blockquote className="mt-2 line-clamp-4 text-[17px] leading-[1.4] font-semibold tracking-[-0.012em] text-[var(--color-headline)]">
                    {s.comment}
                  </blockquote>

                  <span
                    className="mt-3.5 flex gap-0.5"
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

                  {/* `margin-top: auto` as an inline style, not a class: the
                      test asserts the declared value, because jsdom does no
                      layout and a class name proves nothing about where this
                      lands. */}
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
                </article>
              </li>
            ))}
      </ScrollRail>
    </section>
  );
}
