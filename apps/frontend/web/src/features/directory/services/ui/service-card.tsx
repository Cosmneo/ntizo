import { useTranslation } from "react-i18next";
import {
  formatOptionAmount,
  optionDurationMinutes,
  serviceCardImage,
  servicePriceCell,
} from "@/features/directory/services/domain/service-card";
import type { ServiceDTO } from "@/features/directory/services/domain/types";

/**
 * One published service, as a customer browses a provider's page.
 *
 * Selecting it opens the availability panel (`AvailabilitySheet`, in the
 * sibling `directory/availability` feature) — the whole card is one button
 * rather than a smaller "view times" link on top of it, since there is
 * nothing else on this card to click.
 */
export function ServiceCard({
  service,
  providerImageUrl,
  locale,
  onSelect,
}: {
  service: ServiceDTO;
  providerImageUrl: string | null;
  locale: string;
  onSelect: (service: ServiceDTO) => void;
}) {
  const cell = servicePriceCell(service);
  const image = serviceCardImage(service, providerImageUrl);

  return (
    <li className="overflow-hidden rounded-lg border border-[var(--color-border)]">
      <button
        type="button"
        onClick={() => onSelect(service)}
        className="block w-full text-left transition-colors hover:bg-[var(--color-muted)]"
      >
        <div className="aspect-[4/3] w-full overflow-hidden bg-[var(--color-muted)]">
          {image ? (
            <img
              src={image}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : null}
        </div>
        <div className="p-4">
          <h3 className="font-semibold">{service.name}</h3>
          <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
            <ServicePrice cell={cell} locale={locale} />
          </p>
        </div>
      </button>
    </li>
  );
}

/**
 * The price/duration line a card and the availability sheet's own header
 * both show for a service — one definition, so the two never drift apart on
 * how a quote or an hourly rate reads.
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
