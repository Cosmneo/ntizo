import { useTranslation } from "react-i18next";
import { Pencil, X } from "lucide-react";
import {
  formatDayList,
  formatHours,
  minutesToLabel,
  weekdayShortLabel,
  type WeekRuleGroup,
} from "../domain/week";

/**
 * One weekly rule as the provider decided it: the days it covers, the hours it
 * runs, and a sentence saying what that adds up to across the week.
 *
 * The sentence is the reason the card exists rather than a row per day. Five
 * rows reading "09:00–17:00" state the input five times and the output never;
 * one card reading "40 hours a week" states the thing somebody is actually
 * deciding — and it is the same number the preview beside it draws.
 *
 * Both controls carry the hours in their accessible name. Groups are keyed by
 * their hours, so the hours are what make one card's Edit distinguishable from
 * the next card's, to a screen reader as much as to a test.
 */
export function RuleCard({
  group,
  locale,
  canEdit,
  onEdit,
  onRemove,
}: {
  group: WeekRuleGroup;
  locale: string;
  /** Whether the signed-in caller may change this member's week — read live, never cached at mount. */
  canEdit: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation("provider");

  const everyDay = group.weekdays.length === 7;
  const hours = `${minutesToLabel(group.startMinute)} – ${minutesToLabel(group.endMinute)}`;
  const total = formatHours((group.endMinute - group.startMinute) * group.weekdays.length, locale);
  const spokenDays = everyDay ? t("availabilityEveryDay") : formatDayList(locale, group.weekdays, "long");

  return (
    <div
      role="group"
      aria-label={`${spokenDays}, ${hours}`}
      className="grid gap-2 rounded-[var(--radius-card-sm)] border border-[var(--color-border)] p-3.5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap gap-1.5">
          {/* Seven chips saying the same word seven times is a list nobody
              reads; "Every day" is the sentence they were reaching for. */}
          {everyDay ? (
            <DayChip>{t("availabilityEveryDay")}</DayChip>
          ) : (
            group.weekdays.map((weekday) => (
              <DayChip key={weekday}>{weekdayShortLabel(locale, weekday)}</DayChip>
            ))
          )}
        </div>
        {canEdit && (
          <div className="flex shrink-0 items-center gap-1">
            <IconButton label={t("availabilityRuleEditNamed", { hours })} onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton label={t("availabilityRuleRemoveNamed", { hours })} onClick={onRemove}>
              <X className="h-4 w-4" />
            </IconButton>
          </div>
        )}
      </div>

      <p className="type-body-medium font-semibold">{hours}</p>
      <p className="type-caption text-[var(--color-muted-foreground)]">
        {t("availabilityRuleTotal", { total })}
      </p>
    </div>
  );
}

function DayChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="type-caption rounded-full bg-[color-mix(in_srgb,var(--color-primary)_12%,transparent)] px-2.5 py-1 text-[var(--color-primary)]">
      {children}
    </span>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid h-7 w-7 place-items-center rounded-full text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:outline-none"
    >
      {children}
    </button>
  );
}
