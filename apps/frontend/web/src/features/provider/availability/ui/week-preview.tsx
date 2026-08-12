import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@ntizo/frontend-ui";
import { WEEKDAY_ORDER, minutesToLabel, weekdayLabel } from "../domain/week";
import type { PreviewDay } from "../domain/preview";

/**
 * The week those rules actually produce, beside the rules themselves.
 *
 * The reference this came from previews what a generation job *will* write.
 * Here there is no job: the same functions that draw this grid are the ones
 * that answer a customer, so a provider is looking at the product rather than
 * at a forecast of it.
 *
 * Displayed Monday-first while every stored `weekday` stays 0 = Sunday —
 * `WEEKDAY_ORDER` is the only place the two orders meet, and it is a display
 * concern alone.
 */
const DAY_START = 6 * 60; // 06:00 — earlier than any plausible working hour
const DAY_END = 24 * 60;
const HOUR_ROWS = Array.from({ length: (DAY_END - DAY_START) / 60 }, (_, i) => DAY_START + i * 60);

export function WeekPreview({
  days,
  weekLabel,
  onPreviousWeek,
  onNextWeek,
  onToday,
  locale,
}: {
  /** Seven days, in stored order — this component reorders them for display. */
  days: readonly PreviewDay[];
  weekLabel: string;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  locale: string;
}) {
  const { t } = useTranslation("provider");
  const byWeekday = new Map(days.map((d) => [d.weekday, d]));
  const ordered = WEEKDAY_ORDER.map((w) => byWeekday.get(w)).filter(
    (d): d is PreviewDay => d !== undefined,
  );

  return (
    <section
      aria-label={t("availabilityPreviewTitle")}
      className="grid gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] p-4"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
          {t("availabilityPreviewTitle")}
        </h3>
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="sm" onClick={onPreviousWeek} aria-label={t("availabilityPreviousWeek")}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onToday}>
            {t("availabilityToday")}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onNextWeek} aria-label={t("availabilityNextWeek")}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <p className="type-body-medium font-semibold">{weekLabel}</p>

      <div className="overflow-x-auto">
        <div className="grid min-w-[42rem] grid-cols-[3rem_repeat(7,1fr)] gap-px">
          <div />
          {ordered.map((d) => (
            <div key={d.date} className="type-caption pb-1 text-center text-[var(--color-muted-foreground)]">
              {weekdayLabel(locale, d.weekday)}
            </div>
          ))}

          <div className="grid" style={{ gridTemplateRows: `repeat(${HOUR_ROWS.length}, 2rem)` }}>
            {HOUR_ROWS.map((m) => (
              <div key={m} className="type-caption pr-1 text-right text-[var(--color-muted-foreground)]">
                {minutesToLabel(m)}
              </div>
            ))}
          </div>

          {ordered.map((d) => (
            <div
              key={d.date}
              className="relative rounded-[var(--radius-card-sm)] bg-[var(--color-muted)]"
              style={{ height: `${HOUR_ROWS.length * 2}rem` }}
            >
              {d.intervals.map((iv) => (
                <div
                  key={`${iv.start}-${iv.end}`}
                  className="absolute inset-x-0.5 rounded-[var(--radius-card-sm)] bg-[color-mix(in_srgb,var(--color-primary)_18%,transparent)] px-1 py-0.5"
                  style={{
                    top: `${((iv.start - DAY_START) / 60) * 2}rem`,
                    height: `${((iv.end - iv.start) / 60) * 2}rem`,
                  }}
                >
                  <span className="type-caption block truncate text-[var(--color-primary)]">
                    {minutesToLabel(iv.start)}–{minutesToLabel(iv.end)}
                  </span>
                </div>
              ))}
              {/* An empty day says which kind of empty it is: "closed for the
                  holidays" and "you have not set Thursday yet" are different
                  problems with different fixes. */}
              {d.intervals.length === 0 && d.reason && (
                <span className="type-caption absolute inset-x-1 top-2 text-center text-[var(--color-muted-foreground)]">
                  {t(`availabilityPreviewReason.${d.reason}`)}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
