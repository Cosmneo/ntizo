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
import { formatAmount } from "@/features/directory/services/domain/service-card";
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
      subtitle={service.providerName}
      description={service.description ?? undefined}
      tags={
        <>
          {/* The trade leads: "plumbing" rules a card out faster than "at your
              place" does. */}
          <ListingTag tone="category">{service.categoryName}</ListingTag>
          <ListingTag>
            {t(`filterWhereOption.${service.locationType}`, {
              // A location type the client does not know is a value added to
              // the database after this build shipped. Showing the raw code is
              // worse than showing nothing at all on a public card.
              defaultValue: "",
            })}
          </ListingTag>
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
              ? formatAmount(parts.amount.amountMinor, parts.amount.currency, locale)
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
