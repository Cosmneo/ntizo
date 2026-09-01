import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { buttonVariants } from "@ntizo/frontend-ui";
import type { ServiceDetailOptionDTO } from "@ntizo/shared/read-models";
import {
  formatAmount,
  optionDurationMinutes,
} from "@/features/directory/services/domain/service-card";
import { MessageProviderButton } from "@/features/directory/ui/provider-rail";
import { RailCard } from "@/features/directory/ui/rail-card";
import { TrustList } from "@/features/directory/ui/trust-list";

/**
 * What the chosen package costs and what a reader can do about it — the half
 * of `PackageChooser` that acts, split from the half that compares.
 *
 * The headline is `option.amountMinor`, unaltered. Ntizo used to add 10% on
 * top of the provider's price here while the backend deducted that same 10%
 * from what the provider received — two arithmetics that could not both be
 * true. The decision of 2026-08-30 resolved it toward the backend: the
 * provider prices with the fee already in mind, so the customer pays exactly
 * the listed price and there is nothing left for this card to add or to show
 * adding. `bookingTotal` and its constant rate are gone with that line — a
 * function whose total was always its own input was a comment with
 * parentheses, and a rate on the page was a second, staler source of truth
 * for a number `provider.commission_bps` already owns per provider. If a
 * breakdown of what the platform keeps is still wanted somewhere, it belongs
 * to the provider's own earnings view, not to a customer's price summary.
 *
 * **The chosen package is passed in, never chosen here.** `ServiceOptions`
 * renders the rows in the body and `ServiceDetailPage` holds which one is
 * selected, so this card cannot show a total for one package while the body
 * highlights another — the failure the split exists to make impossible.
 *
 * **The primary now starts a booking, and no longer merely shows a calendar.**
 * It links to `/book/<serviceId>`, checkout's step 1, where choosing a time
 * and confirming creates a `DRAFT` that holds the slot. The label stays "see
 * availability" because that is still honestly what the next screen shows
 * first; nothing on this card claims a reservation has been made, because
 * none has.
 *
 * `packageBookingsClosed` — "Bookings aren't open on Ntizo yet" — is the one
 * line left over from when that was true, and it is now stale: the Booking
 * context exists, and this button reaches it. It is deliberately not removed
 * in the slice that built step 1, because steps 2 and 3 do not exist yet and
 * a customer who followed this link would find the flow ends at a page that
 * has not been written. It belongs with the slice that finishes them.
 *
 * **The verification bullet is conditional on a fact.** `providerVerified`
 * means an administrator accepted at least one of this business's documents.
 * A badge that is always lit says nothing and a sentence that is always
 * printed lies — the same rule `ProviderRail` applies to the same sentence,
 * and the reason `TrustList` refuses to hold any claim of its own.
 */
export function RailPriceSummary({
  option,
  locale,
  serviceId,
  providerId,
  providerVerified,
}: {
  option: ServiceDetailOptionDTO;
  locale: string;
  /** Where the primary goes: `/book/<serviceId>`, step 1 of checkout. */
  serviceId: string;
  providerId: string;
  providerVerified: boolean;
}) {
  const { t } = useTranslation("directory");

  // `optionDurationMinutes` handles the fixed-vs-hourly split: a fixed
  // package's own length, or an hourly one's minimum booking — never both, and
  // never `null` for a valid option (`assertOptionShape` guarantees one or the
  // other on the way in). Carried across from `PackageChooser` unchanged,
  // belonging to whichever package is selected, same as the price above.
  const minutes = optionDurationMinutes(option);
  const isHourly = option.pricingMode === "hourly";

  const trustItems = [providerVerified ? t("trustVerified") : null, t("trustFeeIncluded")].filter(
    (item): item is string => item !== null,
  );

  return (
    <RailCard>
      <p className="flex flex-wrap items-baseline gap-2">
        {/* Neither `type-display` nor `type-h1`: this is a number in a 22rem
            column. This headline uses `formatAmount` (decimals: "1200,00 MTn"),
            unlike `ProviderRail`'s headline and `ServiceRow`'s price, which
            use `formatHeadlinePrice` (whole units: "1 200 MTn") — those are
            starting-from prices, browse-card approximations that announce
            themselves as such. This one is what a booking would actually
            charge, exactly the amount the provider set, so it gets the exact
            spelling rather than a rounded one.

            `data-testid` kept from `PackageChooser`: this is the one total
            this card prints now, so it is the one handle every assertion
            about it — here and on the page that composes this card —
            reaches for. */}
        <b
          data-testid="booking-total"
          className="font-display text-[30px] leading-none font-semibold tracking-[-0.02em] tabular-nums"
        >
          {formatAmount(option.amountMinor, option.currency, locale)}
        </b>
        {isHourly && (
          <span className="type-body text-[var(--color-muted-foreground)]">
            {t("priceHourlySuffix")}
          </span>
        )}
      </p>
      {/* Which package that price belongs to. Printed for a single-option
          service too, where `ServiceOptions` renders nothing at all and this
          is the only place the package is named. */}
      <p className="type-body mt-2 text-[var(--color-muted-foreground)]">{option.name}</p>

      {minutes !== null && (
        <dl className="mt-5 grid gap-2 border-t border-[var(--color-border)] pt-5">
          <div className="flex items-center justify-between gap-4">
            <dt className="type-body text-[var(--color-muted-foreground)]">
              {t("packageDuration")}
            </dt>
            <dd className="type-body">
              {t(isHourly ? "serviceMinimumMinutes" : "serviceDurationMinutes", { count: minutes })}
            </dd>
          </div>
        </dl>
      )}

      <div className="mt-5 grid gap-2.5">
        {/* A link, and to a page: this used to open a dialog over the page,
            and a purchase behind a dialog cannot be linked to, opened in a
            new tab, or survived a refresh — never mind the round trip
            through sign-in an anonymous visitor has to make before a slot
            can be held for them.

            `optionId` is the package this card is quoting, and carrying it is
            what makes the total above the total the booking charges. This is
            the one control on the platform that knows which option a customer
            is looking at — `ServiceOptions` puts the selection in
            `ServiceDetailPage`, which hands it here — so if it does not say
            so in the link, nothing downstream can, and checkout books the
            service's default instead. */}
        <Link
          to="/book/$serviceId"
          params={{ serviceId }}
          search={{ optionId: option.id }}
          className={buttonVariants({ className: "w-full" })}
        >
          {t("availabilityCheckAction")}
        </Link>
        {/* Directly under the primary, not at the foot of the card: the
            sentence explains why the button beside a total is a calendar and
            not a reservation, and a qualifier printed after everything else
            is read by whoever was already convinced. */}
        <p className="type-caption text-center text-[var(--color-muted-foreground)]">
          {t("packageBookingsClosed")}
        </p>
        <MessageProviderButton providerId={providerId} variant="outline" />
      </div>

      <TrustList items={trustItems} />
    </RailCard>
  );
}
