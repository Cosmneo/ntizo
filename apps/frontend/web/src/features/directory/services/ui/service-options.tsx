import { useTranslation } from "react-i18next";
import { cn } from "@ntizo/frontend-ui";
import type { ServiceDetailOptionDTO } from "@ntizo/shared/read-models";
import {
  formatAmount,
  optionDurationMinutes,
} from "@/features/directory/services/domain/service-card";

/**
 * The packages a service is sold in, as rows in the body of its page — the
 * half of `PackageChooser` a reader compares, split from the half they act on.
 *
 * The rows are in the body and not in the rail because comparing three
 * packages is reading, and reading happens in the wide column. The rail is
 * 22rem, which is where a price and a button belong and where a name, a
 * length and an amount on one line would wrap into three. It is also the
 * shape a provider's own page already lists services in (`ServiceRow`), so a
 * reader who arrived from there meets the same row twice rather than a row
 * and then a control that looks nothing like it.
 *
 * **Renders nothing at all with fewer than two options.** One radio in a
 * group of one is a control that cannot be operated: there is nothing to
 * choose between, and a section headed "Packages" containing a single
 * already-selected row says only that the page has a section for this. A
 * single-package service states its price once, in the rail, where the total
 * is. Zero options is `serviceDetailPanel`'s `quote` or `unavailable` branch,
 * which the rail answers in words — the body must not put an empty labelled
 * frame above them.
 *
 * Controlled, with no state of its own: `selectedId` and `onSelect` come from
 * `ServiceDetailPage`, which owns the selection so this list and the rail's
 * total cannot disagree about which package is chosen. That is the whole
 * reason `PackageChooser` was split rather than moved — it held the selection
 * privately, so the price a reader saw and the option they had highlighted
 * could only ever agree by living in the same component.
 *
 * The options are printed in the order they arrive. `getService` already
 * orders them cheapest first, and sorting again here would be a second place
 * that rule could drift from the server's — the same restraint
 * `PackageChooser` documented.
 */
export function ServiceOptions({
  options,
  selectedId,
  onSelect,
  locale,
}: {
  options: readonly ServiceDetailOptionDTO[];
  selectedId: string;
  onSelect: (id: string) => void;
  locale: string;
}) {
  const { t } = useTranslation("directory");

  if (options.length < 2) return null;

  return (
    <section className="mt-11">
      <h2 className="type-h2">{t("packagesTitle")}</h2>

      <div role="radiogroup" aria-label={t("packagesTitle")} className="mt-4 grid gap-2.5">
        {options.map((option) => {
          const checked = option.id === selectedId;
          // `optionDurationMinutes` handles the fixed-vs-hourly split: a fixed
          // package's own length, or an hourly one's minimum booking — never
          // both, and never `null` for a valid option (`assertOptionShape`
          // guarantees one or the other on the way in). Carried across from
          // `PackageChooser` unchanged, per option here rather than for the
          // selected one only: the length is part of what the rows are being
          // compared on.
          const minutes = optionDurationMinutes(option);
          const isHourly = option.pricingMode === "hourly";

          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => onSelect(option.id)}
              className={cn(
                "flex w-full items-center justify-between gap-5 rounded-[var(--radius-card)] border px-5 py-4 text-left transition-colors",
                checked
                  ? "border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_7%,transparent)]"
                  : "border-[var(--color-border)] hover:border-[var(--color-muted-foreground)]",
              )}
            >
              <span className="min-w-0">
                <span className="type-body block font-semibold">{option.name}</span>
                {minutes !== null && (
                  <span className="type-caption mt-1 block text-[var(--color-muted-foreground)]">
                    {t(isHourly ? "serviceMinimumMinutes" : "serviceDurationMinutes", {
                      count: minutes,
                    })}
                  </span>
                )}
              </span>

              {/* `formatAmount` deliberately appends no "per hour" suffix of
                  its own — it is a translated string, and a domain function
                  that hard-coded an English one would print it in every
                  locale that calls it. The UI decides, from `pricingMode`. */}
              <span className="type-body shrink-0 font-semibold tabular-nums">
                {formatAmount(option.amountMinor, option.currency, locale)}
                {isHourly ? ` ${t("priceHourlySuffix")}` : ""}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
