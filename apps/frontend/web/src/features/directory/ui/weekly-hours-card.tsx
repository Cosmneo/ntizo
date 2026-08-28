import { useTranslation } from "react-i18next";
import type { WeeklyHoursDTO } from "@ntizo/shared/read-models";
import { groupWeekdays, hasAnyHours } from "@/features/directory/domain/weekly-hours";
import { minutesToLabel } from "@/shared/domain/week-format";
import { RailCard } from "@/features/directory/ui/rail-card";

/**
 * The provider's usual working week, in the sticky rail — "Segunda a sexta
 * 08:00 – 18:00", "Sábado 09:00 – 14:00", and so on, one row per run of
 * consecutive identical days that `groupWeekdays` has already collapsed.
 *
 * Renders nothing at all when `hasAnyHours` says no weekday has an interval.
 * Seven closed days is what a provider who never opened the availability
 * screen looks like, not a business that is genuinely never open — and
 * printing seven rows of "Closed" states the second thing as fact on the
 * strength of the first.
 *
 * `<dt>`'s label gets `first-letter:uppercase` rather than a capital baked
 * into `groupWeekdays`: `Intl` returns Portuguese weekday names lowercase
 * ("segunda a sexta"), which is correct running-text Portuguese, but wrong
 * the moment the word is a heading on its own line, which is the only way
 * this component uses it. Capitalising inside the domain function would be
 * right here and wrong everywhere else that label might be read mid-sentence.
 */
export function WeeklyHoursCard({ hours }: { hours: readonly WeeklyHoursDTO[] }) {
  const { t, i18n } = useTranslation("directory");
  const locale = i18n.resolvedLanguage ?? i18n.language;

  if (!hasAnyHours(hours)) return null;

  const rows = groupWeekdays(hours, locale);

  return (
    <RailCard label={t("availabilityHeading")} flat>
      <dl className="grid gap-2.5">
        {rows.map((row) => (
          <div key={row.key} className="flex justify-between gap-4 type-body">
            <dt className="first-letter:uppercase">{row.label}</dt>
            {row.intervals.length > 0 ? (
              <dd className="font-semibold tabular-nums">
                {row.intervals
                  .map((interval) => `${minutesToLabel(interval.startMinute)} – ${minutesToLabel(interval.endMinute)}`)
                  .join(", ")}
              </dd>
            ) : (
              <dd className="font-medium text-[var(--color-muted-foreground)]">
                {t("availabilityClosed")}
              </dd>
            )}
          </div>
        ))}
      </dl>
      <p className="type-caption text-[var(--color-muted-foreground)] mt-3.5">
        {t("availabilityUsualNote")}
      </p>
    </RailCard>
  );
}
