import { useTranslation } from "react-i18next";
import { Pencil, Timer, X } from "lucide-react";
import { cn } from "@ntizo/frontend-ui";
import {
  formatDayList,
  formatHours,
  minutesToLabel,
  weekdayLabel,
  weekdayNarrowLabel,
  WEEKDAY_ORDER,
  type WeekRuleGroup,
} from "../domain/week";

/**
 * One weekly rule as the provider decided it: which days it covers, the hours
 * it runs, what that adds up to across the week, and the shape of the slots it
 * will sell.
 *
 * **The dial is the change.** This used to print a chip per covered day, so a
 * Monday-to-Friday rule was five chips that wrapped onto two lines in a 340px
 * column and a Tuesday-only rule was one — two cards of the same rule read as
 * two different kinds of object, and neither said which days were *not*
 * covered. Seven fixed cells always occupy one line, always in week order, and
 * the unlit ones carry as much information as the lit ones: a provider scanning
 * for the gap in their week can now see it.
 *
 * Single letters, from `Intl`'s narrow form — see `weekdayNarrowLabel` for why
 * the abbreviated form cannot be used here (CLDR's "short" Monday in `pt-PT` is
 * the whole word "segunda"). The letters are ambiguous in every language, so
 * each cell carries its full day name as a `title`.
 *
 * The dial is decoration for assistive technology: the group's own label
 * already names the days in a sentence, and a screen reader reading seven cells
 * where two are "on" would be reciting the implementation.
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
  const spokenDays = everyDay
    ? t("availabilityEveryDay")
    : formatDayList(locale, group.weekdays, "long");

  return (
    <div
      role="group"
      aria-label={`${spokenDays}, ${hours}`}
      className="group grid gap-2.5 rounded-[var(--radius-card-sm)] border border-[var(--color-border)] p-3 transition-colors hover:border-[color-mix(in_srgb,var(--color-primary)_34%,var(--color-border))]"
    >
      <div className="flex items-baseline gap-2.5">
        {/* One line: "09:00 –" broken from "13:00" reads as two facts. */}
        <p className="type-h3 font-semibold whitespace-nowrap tabular-nums">{hours}</p>
        <p className="type-caption text-[var(--color-muted-foreground)]">
          {t("availabilityRuleTotal", { total })}
        </p>
        {canEdit && (
          // Always reachable by keyboard and on touch, where there is no hover
          // to reveal anything; the fade only spends the pointer user's
          // attention, and `focus-within` brings it straight back.
          <div className="ml-auto flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
            <IconButton label={t("availabilityRuleEditNamed", { hours })} onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton label={t("availabilityRuleRemoveNamed", { hours })} onClick={onRemove}>
              <X className="h-4 w-4" />
            </IconButton>
          </div>
        )}
      </div>

      <div aria-hidden="true" className="flex gap-1">
        {WEEKDAY_ORDER.map((weekday) => {
          const on = group.weekdays.includes(weekday);
          return (
            <span
              key={weekday}
              // The letter alone is ambiguous in most languages, so every cell
              // carries its own day name on hover; the group's accessible name
              // above carries them for everyone else.
              title={weekdayLabel(locale, weekday)}
              className={cn(
                "grid h-6 flex-1 place-items-center rounded-[6px] border text-[11px] leading-none font-semibold",
                on
                  ? "border-[color-mix(in_srgb,var(--color-primary)_24%,transparent)] bg-[color-mix(in_srgb,var(--color-primary)_11%,transparent)] text-[var(--color-primary)]"
                  : "border-transparent bg-[var(--color-muted)] text-[color-mix(in_srgb,var(--color-muted-foreground)_60%,transparent)]",
              )}
            >
              {weekdayNarrowLabel(locale, weekday)}
            </span>
          );
        })}
      </div>

      {/* What this rule sells, not just when it is open. Only the fields the
          provider actually set: a rule left on the platform's defaults has
          nothing to say here, and printing "Buffer: default" three times per
          card would bury the one rule that *was* customised. */}
      {(group.bufferMinutes !== null ||
        group.slotIntervalMinutes !== null ||
        group.capacity !== null) && (
        <div className="flex flex-wrap gap-1">
          {group.bufferMinutes !== null && (
            <Tag>
              <Timer aria-hidden="true" className="h-3 w-3" />
              {t("availabilityRuleBufferTag", { minutes: group.bufferMinutes })}
            </Tag>
          )}
          {group.slotIntervalMinutes !== null && (
            <Tag>
              {group.slotIntervalMinutes === 0
                ? t("availabilityRuleGridNone")
                : t("availabilityRuleGridTag", { minutes: group.slotIntervalMinutes })}
            </Tag>
          )}
          {group.capacity !== null && (
            <Tag>{t("availabilityRuleCapacityTag", { bookings: group.capacity })}</Tag>
          )}
        </div>
      )}
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="type-caption inline-flex items-center gap-1 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-muted)] px-1.5 py-0.5 text-[11px] tabular-nums text-[var(--color-muted-foreground)]">
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
      className="grid h-7 w-7 cursor-pointer place-items-center rounded-full text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)] focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:outline-none"
    >
      {children}
    </button>
  );
}
