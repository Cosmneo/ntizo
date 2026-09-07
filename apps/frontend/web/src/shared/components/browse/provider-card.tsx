import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import type { ProviderPublicDTO } from "@ntizo/shared";
import { BrandImage } from "@/shared/components/brand-image";
import { RatingMark, TILE_TITLE_LINK_CLASS } from "@/shared/components/browse/result-tile";
import { initialsFrom } from "@/shared/lib/initials";
import { formatRating } from "@/shared/domain/rating";
import { formatHeadlinePrice } from "@/features/directory/services/domain/service-card";

/**
 * One business — the single card the whole site shows for it.
 *
 * First approved for the home page's "verified providers" rail and now the
 * only shape a provider is drawn in: `/providers`' grid imports this same
 * component rather than keeping its own borderless row.
 *
 * **What a row could say that a card cannot.** The row this replaces on
 * `/providers` also printed a business's own description paragraph and up to
 * three of its services with their prices — a ticket-stub rail a card's four
 * slots (an eyebrow, a title, a meta line, a bottom row) have no room for.
 * Both drop with the row. A row with no listed category also fell back to
 * naming the provider's kind (`filterProviderKindOption.individual` /
 * `.organization`); this card's eyebrow shows nothing in that case rather
 * than manufacturing a label the business never gave. The row also closed its
 * link with a screen-reader-only "View business" / "View profile" suffix;
 * this card's link carries only the business's name.
 *
 * Every fact still comes from the shared domain: `formatHeadlinePrice` is the
 * same formatter `ServiceCard` prices with, and `RatingMark`/`ratingNew` are
 * the same mark and the same "New" label every caller shares, from the
 * `directory` namespace.
 */
export function ProviderCard({ provider, locale }: { provider: ProviderPublicDTO; locale: string }) {
  const { t } = useTranslation("landing"); // t:ProviderCard
  // The rating's accessible label lives in the directory namespace, next to
  // `RatingMark`'s other caller: duplicating the string into `landing` here
  // would be the same mistake `formatHeadlinePrice` already made once.
  const { t: td } = useTranslation("directory");
  const where = [provider.district, provider.city].filter(Boolean).join(", ");
  const trade = provider.categories[0]?.name ?? null;
  const priced = provider.fromAmountMinor !== null && provider.fromCurrency !== null;
  // The background is the provider's own photograph only, never the logo —
  // `provider-row.tsx` got this right and this card used to not: falling back
  // to `logoUrl` here stretched the logo full-bleed into the frame *and* left
  // the badge below drawing the same picture again, small, on top of itself.
  const photo = provider.photoUrls[0] ?? null;

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-card-foreground)]">
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-[var(--color-muted)]">
        <BrandImage
          src={photo}
          alt=""
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.035]"
        />
        {/* The badge draws whenever there is a logo, independent of whether a
            photograph sits behind it. With no photo the background is
            `BrandImage`'s own `MediaFallback`, not the logo, so the two can
            never repeat the same picture — unlike the background itself, this
            has nothing to fall back to when it is absent. A logo that 404s
            falls back to the provider's initials rather than the brand mark:
            this badge is the business's own face, not a missing photograph. */}
        {provider.logoUrl ? (
          <span className="absolute bottom-3 left-3 z-[2] grid h-11 w-11 place-items-center overflow-hidden rounded-xl bg-white shadow-md">
            <BrandImage
              src={provider.logoUrl}
              alt=""
              className="h-full w-full object-cover"
              fallback={
                <span
                  aria-hidden="true"
                  className="text-[13px] font-semibold text-[var(--color-primary)]"
                >
                  {initialsFrom(provider.name)}
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
            params={{ slug: provider.slug }}
            className={TILE_TITLE_LINK_CLASS}
          >
            {provider.name}
          </Link>
          {provider.verified ? (
            // `inline-grid`, not the service card's own `grid`: that badge
            // sits inside a flex row, this one sits inside a line-clamped
            // heading's normal text flow, where a block-level badge would
            // force a line break before the name. `align-middle` on an inline
            // badge beside running text is the same trick `collection-card.tsx`
            // already uses.
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
        {provider.serviceCount > 0 && (
          <p className="text-[13px] text-[var(--color-muted-foreground)]">
            {td("providerServiceCount", { count: provider.serviceCount })}
          </p>
        )}
        <div className="mt-auto flex items-baseline justify-between gap-3 pt-2.5">
          {provider.ratingAverage === null ? (
            // Not a zero: a provider nobody has reviewed yet is new, the same
            // rule every caller of this card follows for the same reason.
            <span className="shrink-0 text-[13px] text-[var(--color-muted-foreground)]">
              {td("ratingNew")}
            </span>
          ) : (
            // The same shared mark the directory row printed, with the
            // accessible label it carries: the digits alone read as "4.8 (12)"
            // to a screen reader, with no unit and no clue what the number in
            // parentheses is.
            <RatingMark
              average={provider.ratingAverage}
              count={provider.reviewCount}
              locale={locale}
              label={td("providerRatingLabel", {
                score: formatRating(provider.ratingAverage, locale),
                count: provider.reviewCount,
              })}
            />
          )}
          {priced ? (
            <b className="text-right text-[15.5px] font-bold text-[var(--color-headline)]">
              <span className="mr-[3px] text-[12.5px] font-medium text-[var(--color-muted-foreground)]">
                {td("priceFromPrefix")}
              </span>
              <span className="tabular-nums">
                {formatHeadlinePrice(provider.fromAmountMinor!, provider.fromCurrency!, locale)}
              </span>
            </b>
          ) : null}
        </div>
      </div>
    </article>
  );
}
