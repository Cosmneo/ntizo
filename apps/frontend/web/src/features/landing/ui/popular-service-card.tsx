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
 * One published service, on the home page's own product card.
 *
 * The client's reference for this card is a bordered product tile —
 * photograph on top, flush to the edge, then a padded body — which is a
 * different shape from `/services`' own borderless `ServiceTile`. That page's
 * design was approved separately and stays untouched; this card exists
 * because the two pages are now allowed to disagree about a service's shape
 * without either one reimplementing what it means to price one.
 *
 * Every fact still comes from the shared domain: `servicePriceLine` decides
 * what the price area shows (a fixed amount, an hourly one, a "from" and its
 * count of options, or the words a quote service prints in place of a price),
 * and `RatingMark`/`ratingNew` are the same mark and the same "New" label the
 * browse card uses, from the `directory` namespace both cards share.
 */
export function PopularServiceCard({ service, locale }: { service: ServiceDTO; locale: string }) {
  const { t } = useTranslation("directory");
  const line = servicePriceLine(service);
  const metaText = line.meta ? t(line.meta.key, line.meta.values ?? {}) : null;
  const where = t(`filterWhereOption.${service.locationType}`, { defaultValue: "" });

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-card-foreground)]">
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--color-muted)]">
        <BrandImage
          src={service.imageUrls[0] ?? null}
          alt=""
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.035]"
        />
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
            // rule the browse card follows for the same reason.
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
