import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowUpRight, Check } from "lucide-react";
import type { ProviderPublicDTO } from "@ntizo/shared";
import {
  ListingCard,
  ListingTag,
  LISTING_TITLE_LINK_CLASS,
} from "@/shared/components/browse/listing-card";
import { ListingMedia } from "@/shared/components/browse/listing-media";
import { PriceStub, stubCtaClass } from "@/shared/components/browse/price-stub";

/** How many trades a card lists before it stops. */
const MAX_CATEGORIES = 3;

/**
 * One business, as somebody scanning the directory meets it.
 *
 * The successor to `ProviderCard`, and the twin of `ServiceListingCard` — the
 * same three columns on the same shells, because these are the platform's two
 * browse surfaces and a reader who has learned one should not have to learn
 * the other. What differs is only what the card has to say: a service sells one
 * job, a business is something somebody is deciding whether to trust, so it
 * carries the description, the trades, the verification and its own score
 * rather than a duration.
 *
 * Its own file rather than inline in the page, because it is the piece with
 * real branching in it: three picture fallbacks, an optional rating, an
 * optional description, a capped tag row, and a price rail that must not be
 * drawn at all for a business that publishes nothing priced.
 */
export function ProviderListingCard({
  provider,
  locale,
  categoryIcon,
}: {
  provider: ProviderPublicDTO;
  /** Formats the amount. The card is handed it rather than reading i18next twice. */
  locale: string;
  /**
   * A Lucide name from the business's leading category, for the generated
   * tile. Null while the category query is in flight, or for a category
   * nobody has given an icon — `ListingMedia` falls back to a tag either way.
   */
  categoryIcon: string | null;
}) {
  const { t } = useTranslation("directory");

  const where = [provider.district, provider.city].filter(Boolean).join(", ");
  const kind = provider.type === "organization" ? t("typeOrganization") : t("typeIndividual");
  // Whether there is a price rail at all. Both halves are checked: `Intl`
  // cannot format an amount without a currency, and the read model can only
  // promise the two arrive together.
  const priced = provider.fromAmountMinor !== null && provider.fromCurrency !== null;

  const cta = (
    <Link
      to="/providers/$slug"
      params={{ slug: provider.slug }}
      className={stubCtaClass()}
    >
      {/* "View business", never "Book". You do not book a business; you open
          it, and what you book is one of the services inside. */}
      {t("providerOpen")}
      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
    </Link>
  );

  return (
    <ListingCard
      media={
        // Three fallbacks, in the order a reader would want them: the business's
        // own photograph of its work, then its logo, then the generated tile.
        // Unlike a service card — which refuses the logo, because in a mixed
        // browse it puts the same picture on four unrelated cards — here every
        // card *is* that business, so its logo is exactly the right picture.
        // Most businesses have neither, which is why the third fallback is
        // generated rather than grey.
        <ListingMedia
          imageUrl={provider.photoUrls[0] ?? provider.logoUrl ?? null}
          // The trade, not the id: a plumber should look like a plumber
          // wherever it lands. A business with no published category yet has
          // no trade to seed with, so its id keeps the hue at least stable
          // across renders.
          seed={provider.categories[0]?.code ?? provider.id}
          name={provider.name}
          icon={categoryIcon}
        />
      }
      meta={
        <>
          <span>{kind}</span>
          {/* Guarded. A business that has given neither district nor city
              would otherwise draw a separator dot with nothing after it. */}
          {where && (
            <>
              <span
                aria-hidden="true"
                className="h-1 w-1 shrink-0 rounded-full bg-[var(--color-border-strong)]"
              />
              <span className="truncate">{where}</span>
            </>
          )}
        </>
      }
      title={
        <h3 className="font-rounded text-[1.2rem] leading-[1.28] font-semibold tracking-[-0.015em]">
          <Link
            to="/providers/$slug"
            params={{ slug: provider.slug }}
            className={LISTING_TITLE_LINK_CLASS}
          >
            {provider.name}
          </Link>
        </h3>
      }
      description={provider.description ?? undefined}
      tags={
        <>
          {/* Capped. A business publishing in eight trades would push the
              price off every card in its row. */}
          {provider.categories.slice(0, MAX_CATEGORIES).map((c) => (
            <ListingTag key={c.code} tone="category" testId="provider-category">
              {c.name}
            </ListingTag>
          ))}
          {/* Above zero only: "0 services" beside a business you can still
              message is a discouragement with no action behind it. */}
          {provider.serviceCount > 0 && (
            <ListingTag>{t("providerServiceCount", { count: provider.serviceCount })}</ListingTag>
          )}
          {/* `good`, because this is the one claim on the card the platform
              makes itself rather than repeats: an administrator checked a
              document. */}
          {provider.verified && (
            <ListingTag tone="good">
              <Check className="h-3 w-3" aria-hidden="true" />
              {t("providerVerified")}
            </ListingTag>
          )}
        </>
      }
      // Only where there is no rail to put it in — see `stub` below.
      {...(priced ? {} : { action: cta })}
      {...(priced
        ? {
            stub: (
              <PriceStub
                {...(provider.ratingAverage === null
                  ? {}
                  : {
                      // No attribution. The score is this business's own, so
                      // naming whose it is would be answering a question
                      // nobody asked — unlike a service card, where the score
                      // belongs to the provider and must say so.
                      rating: {
                        average: provider.ratingAverage,
                        count: provider.reviewCount,
                      },
                    })}
                eyebrow={t("providerFrom")}
                amount={formatPrice(provider.fromAmountMinor!, provider.fromCurrency!, locale)}
                under={t("stubPerService")}
                action={cta}
              />
            ),
          }
        : {})}
    />
  );
}

/**
 * Minor units as money, in the reader's language.
 *
 * Whole units only: a directory card prints a "from" price, and two decimals
 * of precision on a number that is already an approximation is noise. `Intl`
 * knows every currency's symbol and where it goes, so none of that is spelled
 * out.
 *
 * Its own copy rather than the services domain's `formatAmount`, which keeps
 * the decimals because it also formats `PackageChooser`'s checkout total — a
 * number that is what the customer pays, not a headline, and so cannot round.
 * `ServiceListingCard` holds the twin of this function for the same reason.
 */
function formatPrice(amountMinor: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}
