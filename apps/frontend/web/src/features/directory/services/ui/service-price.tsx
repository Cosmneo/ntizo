import { useTranslation } from "react-i18next";
import {
  formatAmount,
  formatOptionAmount,
  optionDurationMinutes,
  servicePriceCell,
} from "@/features/directory/services/domain/service-card";

/**
 * The price/duration line for a service, given the cell `servicePriceCell`
 * resolved for it — one definition, so no two places that print it drift
 * apart on how a quote or an hourly rate reads.
 *
 * Lifted out of `service-card.tsx` when that file's `ServiceCard` was
 * deleted. The card had been dead since `ProviderServicesSection` moved to
 * `ServiceRow` and the platform-wide browse to `ServiceListingCard`, and it
 * was keeping this function alive as a passenger — a whole unrendered card
 * component standing in front of the one export anything might want.
 */
export function ServicePrice({
  cell,
  locale,
}: {
  cell: ReturnType<typeof servicePriceCell>;
  locale: string;
}) {
  const { t } = useTranslation("directory");

  if (cell.kind === "quote") return <>{t("priceByQuote")}</>;
  if (cell.kind === "unavailable") return <>{t("priceUnavailable")}</>;
  // No duration and no "per hour" beside it: this amount is the cheapest
  // option's, and nothing else about that option reached the caller.
  if (cell.kind === "from") {
    return (
      <>
        {t("priceFrom", {
          amount: formatAmount(cell.amountMinor, cell.currency, locale),
        })}
      </>
    );
  }

  const { option } = cell;
  const amount = formatOptionAmount(option, locale);
  const minutes = optionDurationMinutes(option);
  const isHourly = option.pricingMode === "hourly";

  return (
    <>
      {amount}
      {isHourly ? ` ${t("priceHourlySuffix")}` : ""}
      {minutes !== null ? (
        <>
          {" · "}
          {isHourly
            ? t("serviceMinimumMinutes", { count: minutes })
            : t("serviceDurationMinutes", { count: minutes })}
        </>
      ) : null}
    </>
  );
}
