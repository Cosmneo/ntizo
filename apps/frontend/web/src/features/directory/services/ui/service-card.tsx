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
 * Selecting it will open the panel Task 15 builds — not wired up yet, so
 * this renders as a static card rather than a control that currently does
 * nothing when pressed.
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
    <li className="overflow-hidden rounded-lg border border-[var(--color-border)]">
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
    </li>
  );
}

function ServicePrice({
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
