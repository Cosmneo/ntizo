import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, cn } from "@ntizo/frontend-ui";
import type { ServiceDetailOptionDTO } from "@ntizo/shared/read-models";
import {
  bookingTotal,
  NTIZO_COMMISSION_RATE,
} from "@/features/directory/services/domain/booking-total";
import { formatAmount } from "@/features/directory/services/domain/service-card";

/**
 * What a customer picks, and what it will cost them.
 *
 * Renders nothing at all when `options` is empty. That is a `quote` service —
 * `serviceDetailReadModel` documents `options` as empty precisely for that
 * case — and there is no honest total to show until the provider has priced
 * the job. A chooser with no packages and a "0,00 MT" total would let someone
 * believe they can book a price nobody set.
 *
 * The default selection is the provider's own default, falling back to the
 * first option — the cheapest, since `getService` already orders `options`
 * cheapest first. That order is also why this component never sorts them
 * itself: sorting again here would be a second place the "cheapest first"
 * rule could drift from the server's.
 *
 * There is no Booking context yet (see the design spec's scope boundary), so
 * "Reservar" is rendered disabled with a note explaining why, and never wired
 * to a handler or a link — a disabled button that still looked clickable
 * would be worse than one that plainly is not. The same restraint applies to
 * the "talk to the provider" action beside it: the design spec's own table
 * marks both as placeholders with no backend behind them yet.
 */
export function PackageChooser({
  options,
  locale,
  onSelect,
}: {
  options: readonly ServiceDetailOptionDTO[];
  locale: string;
  /** Told about the reader's choice, including the initial default — nothing in this feature consumes it yet, but a future booking flow needs to know which package was picked. */
  onSelect?: (option: ServiceDetailOptionDTO) => void;
}) {
  const { t } = useTranslation("directory");
  const defaultOption = options.find((o) => o.isDefault) ?? options[0];
  const [selectedId, setSelectedId] = useState(defaultOption?.id);

  if (options.length === 0) return null;

  const selected = options.find((o) => o.id === selectedId) ?? defaultOption!;
  const total = bookingTotal(selected.amountMinor);
  const rate = new Intl.NumberFormat(locale, { style: "percent" }).format(
    NTIZO_COMMISSION_RATE,
  );

  function selectOption(option: ServiceDetailOptionDTO) {
    setSelectedId(option.id);
    onSelect?.(option);
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-5">
      <h2 className="type-body-medium font-semibold">{t("packagesTitle")}</h2>

      <div role="radiogroup" aria-label={t("packagesTitle")} className="mt-3 grid gap-2">
        {options.map((option) => {
          const checked = option.id === selected.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => selectOption(option)}
              className={cn(
                "flex items-center justify-between gap-3 rounded-[var(--radius-card-sm)] border px-4 py-3 text-left transition-colors",
                checked
                  ? "border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_8%,transparent)]"
                  : "border-[var(--color-border)] hover:border-[var(--color-muted-foreground)]",
              )}
            >
              <span className="type-body-medium font-semibold">{option.name}</span>
              <span className="type-body text-[var(--color-muted-foreground)]">
                {formatAmount(option.amountMinor, option.currency, locale)}
                {option.pricingMode === "hourly" ? ` ${t("priceHourlySuffix")}` : ""}
              </span>
            </button>
          );
        })}
      </div>

      <dl className="mt-4 grid gap-1.5 border-t border-[var(--color-border)] pt-4">
        <div className="flex items-center justify-between">
          <dt className="type-body text-[var(--color-muted-foreground)]">
            {t("packagePrice")}
          </dt>
          <dd>{formatAmount(total.packageMinor, selected.currency, locale)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="type-body text-[var(--color-muted-foreground)]">
            {t("packageCommission", { rate })}
          </dt>
          <dd>{formatAmount(total.commissionMinor, selected.currency, locale)}</dd>
        </div>
        <div
          data-testid="booking-total"
          className="type-body-medium flex items-center justify-between font-semibold"
        >
          <dt>{t("packageTotal")}</dt>
          <dd>{formatAmount(total.totalMinor, selected.currency, locale)}</dd>
        </div>
      </dl>

      <div className="mt-4 grid gap-2">
        <Button type="button" disabled className="w-full">
          {t("packageBook")}
        </Button>
        <p className="type-caption text-center text-[var(--color-muted-foreground)]">
          {t("packageBookingsClosed")}
        </p>
        <Button type="button" variant="secondary" disabled className="w-full">
          {t("packageContactProvider")}
        </Button>
      </div>
    </div>
  );
}
