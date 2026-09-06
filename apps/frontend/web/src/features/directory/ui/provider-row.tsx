import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Check, ChevronRight } from "lucide-react";
import type { ProviderPublicDTO } from "@ntizo/shared";
import { ResultRow, ServiceChip } from "@/shared/components/browse/result-row";
import { BrandTile } from "@/shared/components/browse/brand-tile";
import { BrandImage } from "@/shared/components/brand-image";
import {
  RatingMark,
  TILE_TITLE_LINK_CLASS,
} from "@/shared/components/browse/result-tile";
import { formatHeadlinePrice } from "@/features/directory/services/domain/service-card";

/**
 * One business, as a directory row.
 *
 * The successor to `ProviderListingCard` — a row rather than a tile, because a
 * business needs more words than a service does: what it is, where it is,
 * what it sells and for how much. See `ResultRow` for why a row over a card.
 */
export function ProviderRow({
  provider,
  locale,
}: {
  provider: ProviderPublicDTO;
  locale: string;
}) {
  const { t } = useTranslation("directory");
  const photo = provider.photoUrls[0] ?? null;
  const place = [provider.district, provider.city].filter(Boolean).join(", ");
  // The kind and the place as one sentence, not a dot-joined meta line:
  // "Electricista certificado em Sommerschield, Maputo" is what a person would
  // say out loud, and "Individual · Sommerschield" is what a database would.
  const kind = t(`providerKindSentence.${provider.type}`, {
    category: provider.categories[0]?.name ?? t(`filterProviderKindOption.${provider.type}`),
    place,
  });
  const rest = provider.serviceCount - provider.services.length;

  return (
    <ResultRow
      media={
        <div className="relative aspect-[4/3] overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-navy-surface)]">
          {/* `BrandImage` swaps in the navy `BrandTile` both when there is no
              photograph and when the one given 404s — a photo that fails to
              load is the same "no photo is a designed state" as one that was
              never there. */}
          <BrandImage
            src={photo}
            alt=""
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.035]"
            fallback={<BrandTile name={provider.name} />}
          />
          {/* The logo sits on the photograph: a square for a business, a circle
              for a person. With no photograph the tile above is the brand's own
              and the logo centres on it, so the row keeps its shape either way. */}
          {provider.logoUrl && (
            <span
              className={[
                "absolute z-[2] grid place-items-center overflow-hidden bg-[var(--color-background)] shadow-[0_2px_10px_rgba(0,0,0,.22)]",
                photo ? "bottom-3 left-3 h-11 w-11" : "bottom-1/2 left-1/2 h-16 w-16 translate-x-[-50%] translate-y-1/2",
                provider.type === "individual" ? "rounded-full" : "rounded-[12px]",
              ].join(" ")}
            >
              <img src={provider.logoUrl} alt="" role="presentation" className="h-full w-full object-cover" />
            </span>
          )}
        </div>
      }
      title={
        <h3 className="flex items-center gap-2 text-[19px] font-bold leading-tight tracking-[-0.015em] text-[var(--color-foreground)]">
          <Link
            to="/providers/$slug"
            params={{ slug: provider.slug }}
            className={TILE_TITLE_LINK_CLASS}
          >
            {provider.name}
          </Link>
          {provider.verified && (
            <span
              className="grid h-[17px] w-[17px] shrink-0 place-items-center rounded-full bg-[var(--color-navy-surface)]"
              aria-label={t("providerVerified")}
            >
              <Check className="h-3 w-3 text-[var(--color-navy-on)]" aria-hidden="true" strokeWidth={3.4} />
            </span>
          )}
        </h3>
      }
      kind={
        <p data-testid="row-kind" className="text-[14px] text-[var(--color-muted-foreground)]">
          {kind}
        </p>
      }
      description={
        provider.description ? (
          <p className="line-clamp-2 max-w-[60ch] text-[14.5px] leading-relaxed">
            {provider.description}
          </p>
        ) : null
      }
      services={
        provider.services.length > 0 || rest > 0 ? (
          <ul className="mt-2 flex list-none flex-wrap gap-1.5 p-0">
            {provider.services.map((s) => (
              <ServiceChip
                key={`${s.name}-${String(s.amountMinor)}`}
                name={s.name}
                price={formatHeadlinePrice(s.amountMinor, s.currency, locale)}
              />
            ))}
            {provider.services.length === 0 ? (
              /* A business that only quotes sends no chips at all — the DTO
                 skips a quote-priced service rather than sending it with no
                 amount — but it still has a `serviceCount` worth naming.
                 "2 more" with nothing before it would read as an error, so
                 this says what it sells the same quiet way the side rail's
                 own `providerServiceCount` already does. */
              <li className="self-center pl-0.5 text-[13px] font-semibold text-[var(--color-primary)]">
                {t("providerServiceCount", { count: provider.serviceCount })}
              </li>
            ) : (
              // Against `serviceCount`, not against the array: the array is
              // capped at three server-side, and counting it would always say
              // "+0".
              rest > 0 && (
                <li className="self-center pl-0.5 text-[13px] font-semibold text-[var(--color-primary)]">
                  {t("providerServicesMore", { count: rest })}
                </li>
              )
            )}
          </ul>
        ) : null
      }
      side={
        <div className="grid content-between justify-items-end pt-1 text-right">
          {provider.ratingAverage === null ? (
            <span className="text-[13px] text-[var(--color-muted-foreground)]">{t("ratingNew")}</span>
          ) : (
            <RatingMark
              average={provider.ratingAverage}
              count={provider.reviewCount}
              label={t("providerRatingLabel", {
                score: provider.ratingAverage.toFixed(1),
                count: provider.reviewCount,
              })}
            />
          )}
          <div>
            {provider.fromAmountMinor !== null && provider.fromCurrency !== null && (
              <p className="grid justify-items-end">
                <small className="text-[12.5px] text-[var(--color-muted-foreground)]">
                  {t("priceFromPrefix")}
                </small>
                <b className="text-[20px] font-bold leading-tight text-[var(--color-headline)] tabular-nums">
                  {formatHeadlinePrice(provider.fromAmountMinor, provider.fromCurrency, locale)}
                </b>
                <span className="mt-0.5 text-[12.5px] text-[var(--color-muted-foreground)]">
                  {t("providerServiceCount", { count: provider.serviceCount })}
                </span>
              </p>
            )}
            {/* Decoration of the row's own link, not a second tab stop: the
                whole row already goes there, and a chevron a keyboard reader
                has to step past adds a stop that goes nowhere new. */}
            <span
              aria-hidden="true"
              className="mt-2.5 grid h-[34px] w-[34px] place-items-center rounded-full border border-[var(--color-border-strong)] text-[var(--color-headline)]"
            >
              <ChevronRight className="h-[15px] w-[15px]" />
            </span>
            <span className="sr-only">
              {t(provider.type === "individual" ? "providerOpenPerson" : "providerOpenBusiness")}
            </span>
          </div>
        </div>
      }
    />
  );
}
