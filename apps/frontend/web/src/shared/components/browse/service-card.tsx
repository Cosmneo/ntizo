import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { BrandImage } from "@/shared/components/brand-image";
import { RatingMark, TILE_TITLE_LINK_CLASS } from "@/shared/components/browse/result-tile";
import { formatRating } from "@/shared/domain/rating";
import {
  formatHeadlinePrice,
  servicePriceLine,
} from "@/features/directory/services/domain/service-card";
import type { ServiceDTO } from "@/features/directory/services/domain/types";

/**
 * One published service — the single card the whole site shows for it.
 *
 * A bordered product tile — photograph on top, flush to the edge, then a
 * padded body — first approved on the home page and now the only shape a
 * service is drawn in: the home page's "popular services" rail, `/services`'
 * grid and any future list all import this one component rather than each
 * keeping its own idea of what a service looks like.
 *
 * Every fact still comes from the shared domain: `servicePriceLine` decides
 * what the price area shows (a fixed amount, an hourly one, a "from" and its
 * count of options, or the words a quote service prints in place of a price),
 * and `RatingMark`/`ratingNew` are the same mark and the same "New" label
 * every caller shares, from the `directory` namespace.
 *
 * **No button, and one exception.** The price is what the eye lands on and the
 * card is the link; a blue button repeated twenty-four times down a page would
 * compete with every price on it and with the one button that matters, in the
 * search bar. The favourite earns its exception by costing almost nothing: it
 * stands on the photograph rather than in the words, so the body's lines keep
 * their column and a saved card is exactly as tall as an unsaved one.
 */
export function ServiceCard({
  service,
  locale,
  favourite,
}: {
  service: ServiceDTO;
  locale: string;
  /**
   * The heart, drawn on the photograph — or nothing, for a caller that wants
   * a card with no control on it at all, which is what the home page's rails
   * pass.
   *
   * A node the page builds rather than a `saved` flag this card turns into
   * one: the marks for a page come from a single `useFavouriteMarks` call up
   * there, so the page is what knows the answer, and the card goes on being a
   * thing that is handed a `ServiceDTO` and asks nobody anything.
   */
  favourite?: ReactNode;
}) {
  const { t } = useTranslation("directory");
  const line = servicePriceLine(service);
  const metaText = line.meta ? t(line.meta.key, line.meta.values ?? {}) : null;
  const where = t(`filterWhereOption.${service.locationType}`, { defaultValue: "" });

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-card-foreground)]">
      {/* `relative` is the positioning context the heart resolves against, and
          this box rather than the `<article>` is the slot's home for the same
          reason `TileMedia` was before it: it is the same box whether the
          listing has a photograph or the site's placeholder, so the control
          does not move depending on whether a provider uploaded a picture. */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--color-muted)]">
        <BrandImage
          src={service.imageUrls[0] ?? null}
          alt=""
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.035]"
        />
        {favourite}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <p className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-[var(--color-muted-foreground)]">
          <span className="min-w-0 truncate">{service.providerName}</span>
          {service.providerVerified && (
            <span
              className="grid h-[14px] w-[14px] shrink-0 place-items-center rounded-full bg-[var(--color-navy-surface)]"
              aria-label={t("providerVerified")}
            >
              <Check className="h-2.5 w-2.5 text-[var(--color-navy-on)]" aria-hidden="true" strokeWidth={3.4} />
            </span>
          )}
        </p>
        <h3 className="line-clamp-2 text-[15.5px] font-bold leading-snug text-[var(--color-foreground)] group-hover:underline group-hover:decoration-[1.5px] group-hover:underline-offset-[3px] group-focus-within:underline">
          <Link to="/services/$id" params={{ id: service.id }} className={TILE_TITLE_LINK_CLASS}>
            {service.name}
          </Link>
        </h3>
        {(metaText || where) && (
          <p className="flex flex-wrap items-center gap-1 text-[13px] text-[var(--color-muted-foreground)]">
            {metaText && <span className="whitespace-nowrap">{metaText}</span>}
            {metaText && where && <span aria-hidden="true">·</span>}
            {where && <span className="whitespace-nowrap">{where}</span>}
          </p>
        )}
        <div className="mt-auto flex items-baseline justify-between gap-3 pt-2.5">
          {service.providerRatingAverage === null ? (
            // Not a zero: a provider nobody has reviewed yet is new, the same
            // rule every caller of this card follows for the same reason.
            <span className="shrink-0 text-[13px] text-[var(--color-muted-foreground)]">
              {t("ratingNew")}
            </span>
          ) : (
            <RatingMark
              average={service.providerRatingAverage}
              count={service.providerReviewCount}
              locale={locale}
              label={t("providerRatingLabel", {
                score: formatRating(service.providerRatingAverage, locale),
                count: service.providerReviewCount,
              })}
            />
          )}
          <b className="text-right text-[15.5px] font-bold text-[var(--color-headline)]">
            {line.amount.kind === "words" ? (
              <span className="text-[14px] font-semibold">{t(line.amount.key)}</span>
            ) : (
              <>
                {line.amount.from && (
                  <span className="mr-[3px] text-[12.5px] font-medium text-[var(--color-muted-foreground)]">
                    {t("priceFromPrefix")}
                  </span>
                )}
                <span className="tabular-nums">
                  {formatHeadlinePrice(line.amount.amountMinor, line.amount.currency, locale)}
                  {line.amount.perHour && (
                    <span className="text-[12.5px] font-semibold text-[var(--color-muted-foreground)]">
                      {t("pricePerHourUnit")}
                    </span>
                  )}
                </span>
              </>
            )}
          </b>
        </div>
      </div>
    </article>
  );
}
