import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowUpRight } from "lucide-react";
import {
  ListingCard,
  ListingTag,
  LISTING_TITLE_LINK_CLASS,
} from "@/shared/components/browse/listing-card";
import { ListingMedia } from "@/shared/components/browse/listing-media";
import { PriceStub, stubCtaClass } from "@/shared/components/browse/price-stub";
import { serviceStubParts } from "@/features/directory/services/domain/service-stub";
import type { ServiceDTO } from "@/features/directory/services/domain/types";

/**
 * One published service, as a customer browses the whole platform.
 *
 * The successor to `BrowseServiceCard`, and a row rather than a grid tile: a
 * service is a *committed offer* — a price and a duration fixed before you
 * agree — and the row is what gives that offer its own rail to sit in. See
 * `PriceStub`, whose dashed rule and punched notches are the design's one
 * deliberate flourish and the reason the third column reads as a ticket stub
 * rather than as a paragraph pushed right.
 *
 * Its own file rather than inline in the page, because it is the piece with
 * real branching in it: four price shapes, an optional rating, an optional
 * photograph, and a CTA that must not promise a checkout the service has not
 * got.
 *
 * **No meta line.** `ListingCard` offers one and the approved mockup fills it
 * with a duration and an availability line — but the availability ("free today
 * at 15:30") is data this platform does not have, and the duration is already
 * the stub's `under`, decided by `serviceStubParts`. Printing 45 min twice on
 * one card is noise, not emphasis. The slot stays open for whoever builds the
 * availability read model.
 */
export function ServiceListingCard({
  service,
  locale,
  categoryIcon,
}: {
  service: ServiceDTO;
  /** Formats the amount. The card is handed it rather than reading i18next twice. */
  locale: string;
  /**
   * A Lucide name from the category's own `icon` column, for the generated
   * tile. Null while the category query is in flight, or for a category
   * nobody has given an icon — `ListingMedia` falls back to a tag either way.
   */
  categoryIcon: string | null;
}) {
  const { t } = useTranslation("directory");
  const parts = serviceStubParts(service);
  const where = t(`filterWhereOption.${service.locationType}`, { defaultValue: "" });

  return (
    <ListingCard
      media={
        // The image falls back to nothing rather than to the provider's logo:
        // on a provider's own page a logo is recognisable context, but in a
        // mixed browse it puts the same picture on four unrelated cards.
        // `ListingMedia`'s generated tile is the fallback instead, and its hue
        // comes from the category so a trade looks the same wherever it lands.
        <ListingMedia
          imageUrl={service.imageUrls[0] ?? null}
          seed={service.categoryCode}
          name={service.providerName}
          icon={categoryIcon}
        />
      }
      title={
        // The title link, not the card, carries the destination — and it goes
        // to `/services/$id`, not to the provider. A reader who clicked
        // "Corte de cabelo" wanted that service, not a chance to hunt for it
        // again among everything else the barbershop offers.
        <h3 className="font-rounded text-[1.2rem] leading-[1.28] font-semibold tracking-[-0.015em]">
          <Link
            to="/services/$id"
            params={{ id: service.id }}
            className={LISTING_TITLE_LINK_CLASS}
          >
            {service.name}
          </Link>
        </h3>
      }
      // Named as the service's author. "Estúdio Mavalane" alone under
      // "Corte de cabelo" reads as a subtitle of the service rather than as
      // whose service it is — and the preposition is a word each language
      // places and inflects for itself, so it is a key, not a prefix.
      subtitle={t("listingByProvider", { name: service.providerName })}
      description={service.description ?? undefined}
      tags={
        <>
          {/* The trade leads: "plumbing" rules a card out faster than "at your
              place" does. */}
          <ListingTag tone="category">{service.categoryName}</ListingTag>
          {/* A location type the client does not know is a value added to the
              database after this build shipped. Showing the raw code is worse
              than showing nothing — and so is an empty pill, which is what an
              unguarded `ListingTag` around an empty string draws. */}
          {where && <ListingTag>{where}</ListingTag>}
        </>
      }
      stub={
        <PriceStub
          {...(service.providerRatingAverage === null
            ? {}
            : {
                // The rating is the *provider's*, so it says so. Unlabelled it
                // would claim this service has been reviewed six times, which
                // it has not been reviewed at all.
                rating: {
                  average: service.providerRatingAverage,
                  count: service.providerReviewCount,
                  attribution: t("stubProviderRating"),
                },
              })}
          eyebrow={t(parts.eyebrowKey)}
          amount={
            parts.amount.kind === "money"
              ? formatPrice(parts.amount.amountMinor, parts.amount.currency, locale)
              : t(parts.amount.key)
          }
          {...(parts.under ? { under: t(parts.under.key, parts.under.values) } : {})}
          action={
            <Link
              to="/services/$id"
              params={{ id: service.id }}
              className={stubCtaClass(parts.variant)}
            >
              {/* Keyed off `bookingMode`, not off the stub's variant. A
                  `priced` service whose last option was deactivated is also
                  quiet, and telling *that* customer to ask for a price is
                  wrong advice — the price exists, its packages are gone. */}
              {service.bookingMode === "quote" ? t("packageContactProvider") : t("packageBook")}
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          }
        />
      }
    />
  );
}

/**
 * Minor units as money on a browse card, in the reader's language.
 *
 * Whole units, and the twin of `ProviderListingCard`'s own `formatPrice` down
 * to the option object — the two cards sit in the same column of the same
 * product, and one writing `800 MZN` beside the other writing `1200,00 MZN` is
 * the platform disagreeing with itself about how it writes a price. The
 * approved mockup writes whole units, so both do.
 *
 * Here rather than in the services domain's `formatAmount`: that helper also
 * formats `PackageChooser`'s line items and its total, and a checkout total
 * rounded to the escudo is a different number from the one the customer pays.
 * A card is a headline price and can round; a total cannot.
 *
 * A private copy rather than an import from the provider card, because these
 * two files are deliberate twins and making one depend on the other is how a
 * change to "the directory's price format" silently moves the services page.
 */
function formatPrice(amountMinor: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}
