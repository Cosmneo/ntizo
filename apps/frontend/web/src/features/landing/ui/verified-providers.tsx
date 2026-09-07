import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Check, Star } from "lucide-react";
import { Skeleton } from "@ntizo/frontend-ui";
import { BrandImage } from "@/shared/components/brand-image";
import { BrandTile } from "@/shared/components/browse/brand-tile";
import { TILE_TITLE_LINK_CLASS } from "@/shared/components/browse/result-tile";
import { formatRating } from "@/shared/domain/rating";
import { initialsOf } from "@/shared/domain/initials";
import { usePopularProviders } from "@/features/landing/viewmodel/use-popular-providers";
import { useLocale } from "@/features/landing/viewmodel/use-locale";
import { SectionHead } from "@/features/landing/ui/section-head";

/** How many businesses the home page names. */
export const LANDING_PROVIDERS = 3;

/**
 * Minor units as money, in the reader's language.
 *
 * Whole units only: this is a "from" price and two decimals on an
 * approximation is noise. `useGrouping: "always"` because pt-MZ and pt-PT set
 * `minimumGroupingDigits: 2`, so their default leaves a four-digit price
 * ungrouped.
 */
function formatFrom(amountMinor: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
    useGrouping: "always",
  }).format(amountMinor / 100);
}

/**
 * The businesses whose documents an administrator checked.
 *
 * The section this splits from used to be called "popular services" and show
 * providers; services have their own section now, so this one can say what it
 * actually means. Both halves of its claim come off the row: a score customers
 * gave, and a verification an administrator performed.
 */
export function VerifiedProviders() {
  const { t } = useTranslation("landing"); // t:VerifiedProviders
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
                <Skeleton className="aspect-[16/10] w-full rounded-[var(--radius-card)]" />
                <Skeleton className="mt-2.5 h-[18px] w-2/3" />
                <Skeleton className="mt-1.5 h-[15px] w-1/2" />
              </li>
            ))
          : items.map((p) => {
              const where = [p.district, p.city].filter(Boolean).join(", ");
              const priced = p.fromAmountMinor !== null && p.fromCurrency !== null;
              const photo = p.photoUrls[0] ?? p.logoUrl;
              return (
                <li key={p.id}>
                  <article className="group relative">
                    <div className="relative aspect-[16/10] overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-navy-surface)]">
                      <BrandImage
                        src={photo}
                        alt=""
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.035]"
                        fallback={<BrandTile name={p.name} />}
                      />
                      {/* The logo badge only when there is a photograph behind
                          it: over the brand tile it would be the same initials
                          twice. */}
                      {photo ? (
                        <span className="absolute bottom-3 left-3 z-[2] grid h-11 w-11 place-items-center overflow-hidden rounded-xl bg-white text-sm font-bold text-[var(--color-headline)] shadow-md">
                          {p.logoUrl ? (
                            <img src={p.logoUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            initialsOf(p.name)
                          )}
                        </span>
                      ) : null}
                    </div>
                    <div className="grid gap-[3px] pt-2.5">
                      <h3 className="flex items-center gap-1.5 text-base font-bold group-hover:underline group-hover:underline-offset-[3px]">
                        <Link
                          to="/providers/$slug"
                          params={{ slug: p.slug }}
                          className={TILE_TITLE_LINK_CLASS}
                        >
                          {p.name}
                        </Link>
                        {p.verified ? (
                          <span
                            className="grid h-[15px] w-[15px] shrink-0 place-items-center rounded-full bg-[var(--color-navy-surface)]"
                            aria-label={t("badgeVerified")}
                          >
                            <Check className="h-2.5 w-2.5 text-[var(--color-navy-on)]" strokeWidth={3.4} aria-hidden="true" />
                          </span>
                        ) : null}
                      </h3>
                      <p className="flex items-center gap-1.5 text-[13.5px] text-[var(--color-muted-foreground)]">
                        {p.categories[0]?.name}
                        {where ? <span>· {where}</span> : null}
                        {p.ratingAverage !== null ? (
                          <span className="ml-auto inline-flex shrink-0 items-center gap-1 font-semibold text-[var(--color-foreground)]">
                            <Star className="h-3 w-3 fill-[var(--color-warning)] text-[var(--color-warning)]" aria-hidden="true" />
                            <span className="tabular-nums">{formatRating(p.ratingAverage, locale)}</span>
                            <span className="font-normal">({p.reviewCount})</span>
                          </span>
                        ) : (
                          <span className="ml-auto shrink-0">{t("noReviewsYet")}</span>
                        )}
                      </p>
                      {priced ? (
                        <p className="mt-0.5 text-[13.5px] text-[var(--color-muted-foreground)]">
                          <b className="text-[15px] font-bold text-[var(--color-headline)]">
                            {formatFrom(p.fromAmountMinor!, p.fromCurrency!, locale)}
                          </b>
                        </p>
                      ) : null}
                    </div>
                  </article>
                </li>
              );
            })}
      </ul>
    </section>
  );
}
