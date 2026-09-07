import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { Skeleton } from "@ntizo/frontend-ui";
import { BrandImage } from "@/shared/components/brand-image";
import { RatingMark, TILE_TITLE_LINK_CLASS } from "@/shared/components/browse/result-tile";
import { initialsFrom } from "@/shared/lib/initials";
import { formatRating } from "@/shared/domain/rating";
import { formatHeadlinePrice } from "@/features/directory/services/domain/service-card";
import { usePopularProviders } from "@/features/landing/viewmodel/use-popular-providers";
import { useLocale } from "@/features/landing/viewmodel/use-locale";
import { SectionHead } from "@/features/landing/ui/section-head";

/** How many businesses the home page names. */
export const LANDING_PROVIDERS = 3;

/**
 * The businesses whose documents an administrator checked.
 *
 * The section this splits from used to be called "popular services" and show
 * providers; services have their own section now, so this one can say what it
 * actually means. Both halves of its claim come off the row: a score customers
 * gave, and a verification an administrator performed.
 *
 * Drawn on the same bordered, photo-on-top card `PopularServiceCard`
 * introduced for the section above — the client saw that shape live and
 * asked for this one to match it exactly rather than keep its old borderless
 * tile. The two cards fill the same four slots (an eyebrow, a title, a meta
 * line, a bottom row) with different facts: where a service names its
 * provider in the eyebrow and the service in the title, a provider names its
 * trade and place in the eyebrow and the business itself in the title, with
 * the verification seal riding beside the name instead of beside a provider
 * byline that no longer exists here.
 */
export function VerifiedProviders() {
  const { t } = useTranslation("landing"); // t:VerifiedProviders
  // The rating's accessible label lives in the directory namespace, next to
  // `RatingMark`'s other caller: duplicating the string into `landing` here
  // would be the same mistake `formatHeadlinePrice` already made once.
  const { t: td } = useTranslation("directory");
  const locale = useLocale();
  const { data, isLoading } = usePopularProviders(LANDING_PROVIDERS);
  const items = data?.items ?? [];

  if (!isLoading && items.length === 0) return null;

  return (
    <section className="page-shell pt-14">
      <SectionHead
        title={t("home.providersTitle")}
        blurb={t("home.providersBlurb")}
        more={{ label: t("home.providersAll"), to: "/providers" }}
      />
      <ul className="grid gap-x-6 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading
          ? Array.from({ length: LANDING_PROVIDERS }, (_, i) => (
              <li key={i}>
                {/* The same shape as the card it stands in for, down to the
                    class values — see `PopularServices`' own skeleton, which
                    this is copied from so neither loading row reflows when
                    its real card replaces it. */}
                <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)]">
                  <Skeleton className="aspect-[16/10] w-full rounded-none" />
                  <div className="grid gap-2 p-4">
                    <Skeleton className="h-[13px] w-1/3" />
                    <Skeleton className="h-[17px] w-4/5" />
                    <Skeleton className="mt-2 h-[15px] w-2/3" />
                  </div>
                </div>
              </li>
            ))
          : items.map((p) => {
              const where = [p.district, p.city].filter(Boolean).join(", ");
              const trade = p.categories[0]?.name ?? null;
              const priced = p.fromAmountMinor !== null && p.fromCurrency !== null;
              // The background is the provider's own photograph only, never
              // the logo — `provider-row.tsx` gets this right and this card
              // used to not: falling back to `logoUrl` here stretched the
              // logo full-bleed into the frame *and* left the badge below
              // drawing the same picture again, small, on top of itself.
              const photo = p.photoUrls[0] ?? null;
              return (
                <li key={p.id}>
                  <article className="group relative flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-card-foreground)]">
                    <div className="relative aspect-[16/10] w-full overflow-hidden bg-[var(--color-muted)]">
                      <BrandImage
                        src={photo}
                        alt=""
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.035]"
                      />
                      {/* The badge draws whenever there is a logo, independent
                          of whether a photograph sits behind it. With no photo
                          the background is `BrandImage`'s own `MediaFallback`,
                          not the logo, so the two can never repeat the same
                          picture — unlike the background itself, this has
                          nothing to fall back to when it is absent. A logo
                          that 404s falls back to the provider's initials
                          rather than the brand mark: this badge is the
                          business's own face, not a missing photograph. */}
                      {p.logoUrl ? (
                        <span className="absolute bottom-3 left-3 z-[2] grid h-11 w-11 place-items-center overflow-hidden rounded-xl bg-white shadow-md">
                          <BrandImage
                            src={p.logoUrl}
                            alt=""
                            className="h-full w-full object-cover"
                            fallback={
                              <span
                                aria-hidden="true"
                                className="text-[13px] font-semibold text-[var(--color-primary)]"
                              >
                                {initialsFrom(p.name)}
                              </span>
                            }
                          />
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-1 flex-col gap-1 p-4">
                      {(trade || where) && (
                        <p className="flex flex-wrap items-center gap-1 text-[12.5px] text-[var(--color-muted-foreground)]">
                          {trade && <span className="whitespace-nowrap">{trade}</span>}
                          {trade && where && <span aria-hidden="true">·</span>}
                          {where && <span className="whitespace-nowrap">{where}</span>}
                        </p>
                      )}
                      <h3 className="line-clamp-2 text-[15.5px] font-bold leading-snug text-[var(--color-foreground)] group-hover:underline group-hover:decoration-[1.5px] group-hover:underline-offset-[3px] group-focus-within:underline">
                        <Link
                          to="/providers/$slug"
                          params={{ slug: p.slug }}
                          className={TILE_TITLE_LINK_CLASS}
                        >
                          {p.name}
                        </Link>
                        {p.verified ? (
                          // `inline-grid`, not the service card's own `grid`:
                          // that badge sits inside a flex row, this one sits
                          // inside a line-clamped heading's normal text flow,
                          // where a block-level badge would force a line
                          // break before the name. `align-middle` on an
                          // inline badge beside running text is the same
                          // trick `collection-card.tsx` already uses.
                          <span
                            className="ml-1.5 inline-grid h-[14px] w-[14px] shrink-0 place-items-center rounded-full bg-[var(--color-navy-surface)] align-middle"
                            aria-label={t("badgeVerified")}
                          >
                            <Check
                              className="h-2.5 w-2.5 text-[var(--color-navy-on)]"
                              strokeWidth={3.4}
                              aria-hidden="true"
                            />
                          </span>
                        ) : null}
                      </h3>
                      {p.serviceCount > 0 && (
                        <p className="text-[13px] text-[var(--color-muted-foreground)]">
                          {td("providerServiceCount", { count: p.serviceCount })}
                        </p>
                      )}
                      <div className="mt-auto flex items-baseline justify-between gap-3 pt-2.5">
                        {p.ratingAverage === null ? (
                          // Not a zero: a provider nobody has reviewed yet is
                          // new, the same rule the browse card follows for
                          // the same reason.
                          <span className="shrink-0 text-[13px] text-[var(--color-muted-foreground)]">
                            {td("ratingNew")}
                          </span>
                        ) : (
                          // The same shared mark the directory row prints,
                          // with the accessible label it carries: the digits
                          // alone read as "4.8 (12)" to a screen reader, with
                          // no unit and no clue what the number in
                          // parentheses is.
                          <RatingMark
                            average={p.ratingAverage}
                            count={p.reviewCount}
                            locale={locale}
                            label={td("providerRatingLabel", {
                              score: formatRating(p.ratingAverage, locale),
                              count: p.reviewCount,
                            })}
                          />
                        )}
                        {priced ? (
                          <b className="text-right text-[15.5px] font-bold text-[var(--color-headline)]">
                            <span className="mr-[3px] text-[12.5px] font-medium text-[var(--color-muted-foreground)]">
                              {td("priceFromPrefix")}
                            </span>
                            <span className="tabular-nums">
                              {formatHeadlinePrice(p.fromAmountMinor!, p.fromCurrency!, locale)}
                            </span>
                          </b>
                        ) : null}
                      </div>
                    </div>
                  </article>
                </li>
              );
            })}
      </ul>
    </section>
  );
}
