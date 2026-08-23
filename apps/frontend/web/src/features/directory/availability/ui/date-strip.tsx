import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@ntizo/frontend-ui";
import { isPast } from "@/features/directory/availability/domain/day-strip";

/**
 * A civil date (`YYYY-MM-DD`) formatted with `Intl`, pinned to UTC so the
 * reader's own device timezone can never shift which calendar day a bare
 * date string reads as — the same trick
 * `provider/availability/domain/week.ts`'s `weekdayLabel` already uses for
 * the identical reason.
 */
function formatDate(dateIso: string, locale: string, options: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = dateIso.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(date);
}

/**
 * The month label and the seven-day strip: a week at a time, navigated with
 * arrows rather than an `IntersectionObserver`-driven infinite scroll — this
 * screen has no "load more" to page through, and the observer traps this
 * project has already paid for (a sentinel that fires once and stalls, one
 * that never fires at all in a hidden tab) only apply to a design this one
 * deliberately isn't.
 */
export function DateStrip({
  week,
  selectedDate,
  todayIso,
  locale,
  onSelectDate,
  onPreviousWeek,
  onNextWeek,
}: {
  week: readonly string[];
  selectedDate: string;
  todayIso: string;
  locale: string;
  onSelectDate: (dateIso: string) => void;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
}) {
  const { t } = useTranslation("directory");
  // The label follows the selected day, not the strip's first day: a week
  // that opens in August and closes in September reads most naturally as
  // "whichever month the day you're looking at belongs to".
  const monthLabel = formatDate(selectedDate, locale, { month: "long", year: "numeric" });

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label={t("availabilityPreviousWeek")}
          onClick={onPreviousWeek}
          className="grid h-8 w-8 place-items-center rounded-full text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold capitalize">{monthLabel}</span>
        <button
          type="button"
          aria-label={t("availabilityNextWeek")}
          onClick={onNextWeek}
          className="grid h-8 w-8 place-items-center rounded-full text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* A calendar row, not seven bordered boxes. The weekday letters are the
          column heading a calendar always has, so they sit above the row once
          rather than inside every cell, and the day itself is a circle — the
          shape a chosen date has in every calendar anyone has used. Boxed and
          filled edge to edge, the selected day read as a pressed button in a
          toolbar rather than as today's date on a calendar. */}
      <div aria-hidden="true" className="grid grid-cols-7 gap-1">
        {week.map((dateIso) => (
          <span
            key={dateIso}
            className="type-caption text-center text-[var(--color-muted-foreground)]"
          >
            {formatDate(dateIso, locale, { weekday: "narrow" })}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {week.map((dateIso) => {
          const past = isPast(dateIso, todayIso);
          const selected = dateIso === selectedDate;
          return (
            <button
              key={dateIso}
              type="button"
              disabled={past}
              aria-pressed={selected}
              // The weekday is `aria-hidden` above, so the button has to name
              // its own date in full — "14" alone is not a date to anyone who
              // cannot see the column it is under.
              aria-label={formatDate(dateIso, locale, {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
              onClick={() => onSelectDate(dateIso)}
              className={cn(
                "mx-auto grid h-10 w-10 place-items-center rounded-full text-sm font-semibold transition-colors disabled:pointer-events-none",
                past && "text-[var(--color-muted-foreground)] line-through opacity-45",
                selected
                  ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                  : "hover:bg-[var(--color-muted)]",
              )}
            >
              <span aria-hidden="true">{formatDate(dateIso, locale, { day: "numeric" })}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
