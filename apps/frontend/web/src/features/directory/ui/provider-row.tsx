import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Check, ChevronRight } from "lucide-react";
import type { ProviderPublicDTO } from "@ntizo/shared";
import { ResultRow, ServiceChip } from "@/shared/components/browse/result-row";
import { BrandImage } from "@/shared/components/brand-image";
import {
  RatingMark,
  TILE_TITLE_LINK_CLASS,
} from "@/shared/components/browse/result-tile";
import { formatRating } from "@/shared/domain/rating";
import { formatHeadlinePrice } from "@/features/directory/services/domain/service-card";

/**
 * One business, as a directory row.
 *
 * The successor to the since-deleted `ProviderListingCard` — a row rather than
 * a tile, because a
 * business needs more words than a service does: what it is, where it is,
 * what it sells and for how much. See `ResultRow` for why a row over a card.
 */
export function ProviderRow({
  provider,
  locale,
  first = false,
}: {
  provider: ProviderPublicDTO;
  locale: string;
  /**
   * Whether this is the first row of the list — forwarded straight to
   * `ResultRow`, which draws the hairline every other row is separated by.
   * The list is `<ul><li><article>`, so no CSS the row could carry would know
   * the answer; only the page's own index does. See `ResultRow`.
   */
  first?: boolean;
}) {
  const { t } = useTranslation("directory");
  const photo = provider.photoUrls[0] ?? null;
  const place = [provider.district, provider.city].filter(Boolean).join(", ");
  const category =
    provider.categories[0]?.name ?? t(`filterProviderKindOption.${provider.type}`);
  // The kind and the place as one sentence, not a dot-joined meta line:
  // "Electricista certificado em Sommerschield, Maputo" is what a person would
  // say out loud, and "Individual · Sommerschield" is what a database would.
  //
  // With no place, the category alone. Both `district` and `city` are nullable
  // (`provider-public.schema.ts`), and a business that filled in neither got
  // the sentence with its tail cut off — "Beleza em " — because the template
  // has nowhere to stop.
  const kind = place
    ? t(`providerKindSentence.${provider.type}`, { category, place })
    : category;
  const rest = provider.serviceCount - provider.services.length;

  return (
    <ResultRow
      first={first}
      media={
        // Sixteen-by-nine on a phone, where the photograph is the full width
        // of a stacked card and a 4:3 crop of it took a third of the screen;
        // four-by-three from `md`, where it is the row's first column.
        <div className="relative aspect-[16/9] overflow-hidden rounded-[14px] bg-[var(--color-navy-surface)] md:aspect-[4/3] md:rounded-[var(--radius-card)]">
          {/* With no `fallback`, `BrandImage` draws the site's own
              `MediaFallback` both when there is no photograph and when the one
              given 404s — a photo that fails to load is the same "no photo is
              a designed state" as one that was never there. It wears this
              `className`, so it fills exactly the box the photograph would
              have. */}
          <BrandImage
            src={photo}
            alt=""
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.035]"
          />
          {/* The logo sits on the photograph: a square for a business, a circle
              for a person. With no photograph the box above is the site's
              placeholder and the logo centres on it, so the row keeps its
              shape either way. */}
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
        <h3 className="flex items-center gap-2 text-[19px] font-bold leading-tight tracking-[-0.015em] text-[var(--color-foreground)] group-focus-within:underline">
          <Link
            to="/providers/$slug"
            params={{ slug: provider.slug }}
            className={TILE_TITLE_LINK_CLASS}
          >
            {provider.name}{" "}
            {/* Inside the link, not loose in the side column. Left there it
                was an orphan sentence a screen reader met after the price,
                belonging to nothing; here it is the end of the link's own
                accessible name — "Estúdio Mavalane View business" — which is
                what it was always trying to say. The space before it is
                explicit because JSX drops the one at a line break, and
                without it the two run together in the computed name. */}
            <span className="sr-only">
              {t(provider.type === "individual" ? "providerOpenPerson" : "providerOpenBusiness")}
            </span>
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
          // Not on a phone. Two lines of a business's own blurb is the first
          // thing to go when the card has to fit more than one to a screen:
          // the name, the kind, what it sells and what it costs are all facts
          // a reader compares rows on, and the blurb is not.
          //
          // `md:line-clamp-2` is what puts it back, without an `md:block`
          // beside it: the clamp *is* a display (`-webkit-box`), and a
          // `display: block` generated after it in the same media query would
          // leave the paragraph unclamped at every width above `md`.
          <p className="hidden max-w-[60ch] text-[14.5px] leading-relaxed md:line-clamp-2">
            {provider.description}
          </p>
        ) : null
      }
      services={
        provider.services.length > 0 || rest > 0 ? (
          /* One line on a phone, wrapping from `md`. Three chips and a "+n"
             wrap to three rows in 358px and the card stops being a card; the
             mask says the row ends mid-chip on purpose, the same way the
             category strip and the quick chips already do. */
          <ul className="mt-2 flex list-none flex-nowrap gap-1.5 overflow-hidden p-0 [mask-image:linear-gradient(90deg,#000_0,#000_calc(100%-56px),transparent_100%)] md:flex-wrap md:overflow-visible md:[mask-image:none]">
            {/* Keyed on the index, not on name-and-price: two services with
                the same name at the same price are a real shape (the backend
                dedupes on service id, not on name) and would collide. The
                list is at most three and is never reordered, filtered or
                added to on the client, which is the condition an index key
                asks for. */}
            {provider.services.map((s, index) => (
              <ServiceChip
                key={index}
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
              <li className="self-center pl-0.5 text-[13px] font-semibold text-[var(--color-headline)]">
                {t("providerServiceCount", { count: provider.serviceCount })}
              </li>
            ) : (
              // Against `serviceCount`, not against the array: the array is
              // capped at three server-side, and counting it would always say
              // "+0".
              rest > 0 && (
                <li className="self-center pl-0.5 text-[13px] font-semibold text-[var(--color-headline)]">
                  {t("providerServicesMore", { count: rest })}
                </li>
              )
            )}
          </ul>
        ) : null
      }
      side={
        /* A column at the right of the row from `md`; one baseline line below
           it — "4,7 · desde 450 MZN · 2 serviços" reading left to right under
           the chips, as the mockup's `.from{grid-auto-flow:column}` draws it.
           Stacked as a third block on a phone it took a third of the card to
           say three short things. */
        <div className="flex flex-wrap items-baseline gap-x-2 md:grid md:content-between md:justify-items-end md:pt-1 md:text-right">
          {provider.ratingAverage === null ? (
            <span className="text-[13px] text-[var(--color-muted-foreground)]">{t("ratingNew")}</span>
          ) : (
            <RatingMark
              average={provider.ratingAverage}
              count={provider.reviewCount}
              locale={locale}
              // The same formatter the mark itself prints with, so the label
              // and the digits beside it never disagree.
              label={t("providerRatingLabel", {
                score: formatRating(provider.ratingAverage, locale),
                count: provider.reviewCount,
              })}
            />
          )}
          {/* `contents` below `md`: the price, the count and the rating are
              one baseline line there, and a wrapper in the middle of them
              would make the whole block a single flex item that cannot align
              with the rating beside it. From `md` it is a block again, which
              is what puts the chevron under the price rather than after it. */}
          <div className="contents md:block">
            {provider.fromAmountMinor !== null && provider.fromCurrency !== null && (
              <p className="flex flex-wrap items-baseline gap-x-2 md:grid md:justify-items-end">
                <small className="text-[12.5px] text-[var(--color-muted-foreground)]">
                  {t("priceFromPrefix")}
                </small>
                <b className="text-[20px] font-bold leading-tight text-[var(--color-headline)] tabular-nums">
                  {formatHeadlinePrice(provider.fromAmountMinor, provider.fromCurrency, locale)}
                </b>
                <span className="text-[12.5px] text-[var(--color-muted-foreground)] md:mt-0.5">
                  {t("providerServiceCount", { count: provider.serviceCount })}
                </span>
              </p>
            )}
            {/* Decoration of the row's own link, not a second tab stop: the
                whole row already goes there, and a chevron a keyboard reader
                has to step past adds a stop that goes nowhere new.

                Not drawn at all on a phone, where the whole card is the tap
                target and a 34px circle pointing at it is a hint nobody
                needs. */}
            <span
              aria-hidden="true"
              className="mt-2.5 hidden h-[34px] w-[34px] place-items-center rounded-full border border-[var(--color-border-strong)] text-[var(--color-headline)] md:grid"
            >
              <ChevronRight className="h-[15px] w-[15px]" />
            </span>
          </div>
        </div>
      }
    />
  );
}
