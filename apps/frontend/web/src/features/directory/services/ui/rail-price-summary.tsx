import { useTranslation } from "react-i18next";
import { Button } from "@ntizo/frontend-ui";
import type { ServiceDetailOptionDTO } from "@ntizo/shared/read-models";
import {
  NTIZO_COMMISSION_RATE,
  bookingTotal,
} from "@/features/directory/services/domain/booking-total";
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
 * The arithmetic is untouched from the chooser: `bookingTotal` rounds the
 * commission once and derives the total by addition, so the three lines on
 * screen add up (read its own doc comment for why `price * 1.1` does not).
 * `NTIZO_COMMISSION_RATE` stays a constant, not a prop — the 10% a customer
 * pays on top is the platform's permanent model, not a per-service setting.
 *
 * **The chosen package is passed in, never chosen here.** `ServiceOptions`
 * renders the rows in the body and `ServiceDetailPage` holds which one is
 * selected, so this card cannot show a total for one package while the body
 * highlights another — the failure the split exists to make impossible.
 *
 * **Nothing here implies a booking was made.** The primary is the calendar,
 * which is the control that actually works today, and `packageBookingsClosed`
 * follows it saying in words why there is no reservation button under a total.
 * The Booking context does not exist: `ntizo_booking.booking` is a placeholder
 * table with four columns. The chooser's disabled "Reservar" is not carried
 * across — a disabled control still advertises a feature, where its absence
 * plus one sentence states the truth.
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
  providerId,
  providerVerified,
  onCheckAvailability,
}: {
  option: ServiceDetailOptionDTO;
  locale: string;
  providerId: string;
  providerVerified: boolean;
  onCheckAvailability: () => void;
}) {
  const { t } = useTranslation("directory");

  const total = bookingTotal(option.amountMinor);
  const rate = new Intl.NumberFormat(locale, { style: "percent" }).format(NTIZO_COMMISSION_RATE);
  // `optionDurationMinutes` handles the fixed-vs-hourly split: a fixed
  // package's own length, or an hourly one's minimum booking — never both, and
  // never `null` for a valid option (`assertOptionShape` guarantees one or the
  // other on the way in). Carried across from `PackageChooser` unchanged,
  // belonging to whichever package is selected, the same way the totals do.
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
            use `formatHeadlinePrice` (whole units: "1 200 MTn"). The headline
            sits above the breakdown's "Price" row showing the same total, so
            rounding one and not the other would display two spellings of the
            same amount inside this card. That inconsistency within a single
            view is worse than a reader seeing "1 200 MTn" on a browse card
            and "1200,00 MTn" here. This trade-off is intentional. */}
        <b className="font-display text-[30px] leading-none font-semibold tracking-[-0.02em] tabular-nums">
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

      <dl className="mt-5 grid gap-2 border-t border-[var(--color-border)] pt-5">
        {minutes !== null && (
          <div className="flex items-center justify-between gap-4">
            <dt className="type-body text-[var(--color-muted-foreground)]">
              {t("packageDuration")}
            </dt>
            <dd className="type-body">
              {t(isHourly ? "serviceMinimumMinutes" : "serviceDurationMinutes", { count: minutes })}
            </dd>
          </div>
        )}
        <div className="flex items-center justify-between gap-4">
          <dt className="type-body text-[var(--color-muted-foreground)]">{t("packagePrice")}</dt>
          <dd className="type-body tabular-nums">
            {formatAmount(total.packageMinor, option.currency, locale)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="type-body text-[var(--color-muted-foreground)]">
            {t("packageCommission", { rate })}
          </dt>
          <dd className="type-body tabular-nums">
            {formatAmount(total.commissionMinor, option.currency, locale)}
          </dd>
        </div>
        {/* `data-testid` kept from `PackageChooser`: this row is the handle
            every assertion about the total reaches for, here and on the page
            that composes this card. The amount is printed twice on this
            screen — as the headline above and as this sum — so a query by
            text could not tell them apart. */}
        <div
          data-testid="booking-total"
          className="mt-1 flex items-center justify-between gap-4 border-t border-[var(--color-border)] pt-3"
        >
          <dt className="type-body font-semibold">{t("packageTotal")}</dt>
          <dd className="type-body font-semibold tabular-nums">
            {formatAmount(total.totalMinor, option.currency, locale)}
          </dd>
        </div>
      </dl>

      <div className="mt-5 grid gap-2.5">
        <Button type="button" className="w-full" onClick={onCheckAvailability}>
          {t("availabilityCheckAction")}
        </Button>
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
