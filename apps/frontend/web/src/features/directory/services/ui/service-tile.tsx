import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import {
  RatingMark,
  ResultTile,
  TileMedia,
  TILE_TITLE_LINK_CLASS,
} from "@/shared/components/browse/result-tile";
import { formatRating } from "@/shared/domain/rating";
import {
  formatHeadlinePrice,
  servicePriceLine,
} from "@/features/directory/services/domain/service-card";
import type { ServiceDTO } from "@/features/directory/services/domain/types";

/**
 * One published service, as a customer browses the whole platform.
 *
 * A tile rather than the row this replaces: four of these fit where one row
 * did, and a service is a product — a photograph, a name and a price is the
 * whole of it. The row existed to give a ticket-stub price rail somewhere to
 * sit, and that rail is gone.
 *
 * **No button.** The price is what the eye lands on and the tile is the link.
 * A blue button repeated twenty-four times down a page competes with every
 * price on it and with the one button that matters, in the header.
 *
 * **The rating lives on the provider line, not the title line.** The score is
 * the *provider's* average across everything they sell, never the service's
 * own — nothing aggregates reviews per service. Beside the service's name it
 * would read as if the haircut itself had six reviews; beside the provider's
 * name, where the seal already sits, it reads as one more fact about who is
 * behind the price.
 */
export function ServiceTile({ service, locale }: { service: ServiceDTO; locale: string }) {
  const { t } = useTranslation("directory");
  const line = servicePriceLine(service);
  const where = t(`filterWhereOption.${service.locationType}`, { defaultValue: "" });

  return (
    <ResultTile
      media={<TileMedia src={service.imageUrls[0] ?? null} />}
      title={
        /* Two lines on a phone, where the row gives the title the whole
           width beside a 116px photo and a clipped name is the one thing
           a reader cannot recover; one truncated line in the desktop
           grid, where four tiles share the row and a second line would
           make every tile in it taller. `sm:line-clamp-none` first,
           because `truncate` alone leaves `display:-webkit-box` in
           place and the clamp would go on applying under it. */
        <h3 className="min-w-0 line-clamp-2 text-[15px] font-semibold text-[var(--color-foreground)] group-hover:underline group-hover:decoration-[1.5px] group-hover:underline-offset-[3px] group-focus-within:underline sm:line-clamp-none sm:truncate">
          <Link to="/services/$id" params={{ id: service.id }} className={TILE_TITLE_LINK_CLASS}>
            {service.name}
          </Link>
        </h3>
      }
      byline={
        <p
          data-testid="tile-byline"
          className="flex min-w-0 items-center gap-1.5 text-[13.5px] text-[var(--color-muted-foreground)]"
        >
          <span className="min-w-0 truncate font-medium text-[var(--color-foreground)]">
            {service.providerName}
          </span>
          {service.providerVerified && (
            <span
              className="grid h-[15px] w-[15px] shrink-0 place-items-center rounded-full bg-[var(--color-navy-surface)]"
              aria-label={t("providerVerified")}
            >
              <Check className="h-2.5 w-2.5 text-[var(--color-navy-on)]" aria-hidden="true" strokeWidth={3.4} />
            </span>
          )}
          {service.providerRatingAverage === null ? (
            // Not a zero and not an empty star: a business nobody has
            // reviewed is new, and rendering 0,0 calls it the worst on the
            // platform.
            <span className="ml-auto shrink-0 text-[13px] text-[var(--color-muted-foreground)]">
              {t("ratingNew")}
            </span>
          ) : (
            <RatingMark
              average={service.providerRatingAverage}
              count={service.providerReviewCount}
              locale={locale}
              // The same formatter the mark itself prints with: a label
              // reading "4.7 out of 5" beside a visible "4,7" is one score
              // told two ways to the one reader who cannot check.
              label={t("providerRatingLabel", {
                score: formatRating(service.providerRatingAverage, locale),
                count: service.providerReviewCount,
              })}
            />
          )}
        </p>
      }
      price={
        <p className="mt-[3px] flex items-baseline gap-3 text-[13.5px] text-[var(--color-muted-foreground)]">
          <b className="text-[15.5px] font-bold text-[var(--color-headline)]">
            {line.amount.kind === "words" ? (
              <span className="text-[14px] font-semibold">{t(line.amount.key)}</span>
            ) : (
              <>
                {line.amount.from && (
                  <span className="mr-[3px] text-[12.5px] font-medium text-[var(--color-muted-foreground)]">
                    {t("priceFromPrefix")}
                  </span>
                )}
                {/* The per-hour unit is nested inside the amount's own span,
                    not a sibling of it, so the two read as one price rather
                    than as an amount with a stray label beside it. */}
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
          {/* Whole phrases, never "45 / min": the phone row's text column is
              212px wide and the line wraps between items, not inside them. */}
          {line.meta && (
            <span className="whitespace-nowrap">{t(line.meta.key, line.meta.values ?? {})}</span>
          )}
          {where && <span className="whitespace-nowrap">{where}</span>}
        </p>
      }
    />
  );
}
