import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  formatAmount,
  formatOptionAmount,
  optionDurationMinutes,
  serviceCardImage,
  servicePriceCell,
} from "@/features/directory/services/domain/service-card";
import type { ServiceDTO } from "@/features/directory/services/domain/types";

/**
 * One published service, as a customer browses a provider's page.
 *
 * The whole card is one control rather than a smaller "view times" link on
 * top of it, since there is nothing else on this card to click — and it is
 * now a link to `/book/<serviceId>`, checkout's step 1, where it used to be a
 * button that opened `AvailabilitySheet` over the page. That sheet is gone,
 * and with it the reason this was a button at all.
 *
 * **Nothing renders this today.** `ProviderServicesSection` moved to
 * `ServiceRow` and the platform-wide browse to `ServiceListingCard`, both
 * before this change; `ServicePrice` below is the part of this file still in
 * use. It is relinked rather than left holding an `onSelect` nobody supplies,
 * because a component whose contract points at a deleted dialog is worse than
 * one nobody calls.
 */
export function ServiceCard({
  service,
  providerImageUrl,
  locale,
}: {
  service: ServiceDTO;
  providerImageUrl: string | null;
  locale: string;
}) {
  const cell = servicePriceCell(service);
  const image = serviceCardImage(service, providerImageUrl);

  return (
    // 3:2 rather than 4:3, and the same lift the browse cards have. The taller
    // crop cost about a third of the card's height for a picture that is
    // illustration — what a reader is choosing between is the name and the
    // price, and those were being pushed down the page by the photograph.
    <li className="group overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-background)] shadow-[0_1px_2px_rgba(19,23,27,0.05)] transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--color-primary)_34%,var(--color-border))] hover:shadow-[0_1px_3px_rgba(19,23,27,0.06),0_10px_26px_-14px_rgba(19,23,27,0.18)]">
      <Link
        to="/book/$serviceId"
        params={{ serviceId: service.id }}
        className="block w-full text-left"
      >
        <div className="aspect-[3/2] w-full overflow-hidden bg-[var(--color-muted)]">
          {image ? (
            <img
              src={image}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : null}
        </div>
        <div className="p-3.5">
          <h3 className="type-body-medium font-semibold">{service.name}</h3>
          <p className="type-caption mt-1.5 text-[var(--color-muted-foreground)]">
            <ServicePrice cell={cell} locale={locale} />
          </p>
        </div>
      </Link>
    </li>
  );
}

/**
 * The price/duration line a service card shows — one definition, so no two
 * places that print it drift apart on how a quote or an hourly rate reads.
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
  // option's, and nothing else about that option reached this card.
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
