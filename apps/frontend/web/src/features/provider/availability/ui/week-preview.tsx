import { useTranslation } from "react-i18next";
import { cn } from "@ntizo/frontend-ui";
import { WEEKDAY_ORDER, formatHours, minutesToLabel, weekdayShortLabel } from "../domain/week";
import { gridWindow, weekTotals } from "../domain/grid";
import type { PreviewDay } from "../domain/preview";

/**
 * The week those rules actually produce.
 *
 * The reference this came from previews what a generation job *will* write.
 * Here there is no job: the same functions that draw this grid are the ones
 * that answer a customer, so a provider is looking at the product rather than
 * at a forecast of it.
 *
 * It no longer draws 06:00–24:00 for everybody — eighteen hour rows, nearly
 * all permanently empty. `gridWindow` crops it to the hours in play, which is
 * what lets seven columns fit where four did. The `min-width` below is not
 * what changed: the old grid needed 42rem inside a 28rem sidebar, which never
 * fit at any width; this one asks for less and sits in the wide pane, so the
 * scroller it keeps for narrow screens is a fallback rather than the norm.
 *
 * An empty day is drawn rather than described. Striped means nothing is set;
 * a filled red block means the day is closed — the difference between "you
 * have not told us about Thursday" and "Thursday is a holiday", which are
 * different problems with different fixes.
 *
 * Displayed Monday-first while every stored `weekday` stays 0 = Sunday —
 * `WEEKDAY_ORDER` is the only place the two orders meet, and it is a display
 * concern alone.
 */

/** Height of one hour row. Rows are hourly, so the window is snapped to hours. */
const ROW_REM = 2;

/** A day with no rule at all, as a texture rather than a sentence. */
const STRIPES =
  "repeating-linear-gradient(135deg,transparent,transparent 6px,var(--color-border) 6px,var(--color-border) 7px)";

export function WeekPreview({
  days,
  locale,
}: {
  /** Seven days, in stored order — this component reorders them for display. */
  days: readonly PreviewDay[];
  locale: string;
}) {
  const { t } = useTranslation("provider");
  const byWeekday = new Map(days.map((d) => [d.weekday, d]));
  const ordered = WEEKDAY_ORDER.map((w) => byWeekday.get(w)).filter(
    (d): d is PreviewDay => d !== undefined,
  );

  const window = gridWindow(days);
  const totals = weekTotals(days);
  const hourRows = Array.from(
    { length: (window.endMinute - window.startMinute) / 60 },
    (_, i) => window.startMinute + i * 60,
  );
  const gridHeight = `${hourRows.length * ROW_REM}rem`;
  const topOf = (minute: number) => ((minute - window.startMinute) / 60) * ROW_REM;

  return (
    <section aria-label={t("availabilityPreviewTitle")} className="grid gap-3 overflow-x-auto">
      <div className="grid min-w-[620px] grid-cols-[2.75rem_repeat(7,minmax(0,1fr))]">
        <div />
        {ordered.map((d) => (
          <div key={d.date} className="type-caption pb-2 text-center text-[var(--color-muted-foreground)]">
            <b className="block font-medium text-[var(--color-foreground)]">
              {weekdayShortLabel(locale, d.weekday)}
            </b>
            {/* Which week this is. A bare "Mon" is the same on all of them,
                and this grid is navigable. */}
            <span className="tabular-nums">{Number(d.date.slice(8))}</span>
          </div>
        ))}

        <div className="grid" style={{ gridTemplateRows: `repeat(${hourRows.length}, ${ROW_REM}rem)` }}>
          {hourRows.map((m) => (
            <span
              key={m}
              // Nudged up so the label sits on its line rather than under it.
              className="type-caption -translate-y-1.5 pr-2 text-right tabular-nums text-[var(--color-muted-foreground)]"
            >
              {minutesToLabel(m)}
            </span>
          ))}
        </div>

        {ordered.map((d) => {
          const closed = d.intervals.length === 0 && d.reason !== "no-rule" && d.reason !== null;
          const bare = d.intervals.length === 0 && d.reason === "no-rule";
          return (
            <div
              key={d.date}
              className="relative border-l border-[var(--color-border)] last-of-type:border-r"
              style={{ height: gridHeight, ...(bare ? { backgroundImage: STRIPES } : {}) }}
            >
              {/* The hour lines, so a block is read against the gutter rather
                  than measured against it. */}
              <div
                aria-hidden="true"
                className="absolute inset-0 grid"
                style={{ gridTemplateRows: `repeat(${hourRows.length}, 1fr)` }}
              >
                {hourRows.map((m) => (
                  <i key={m} className="block border-t border-[var(--color-border)]" />
                ))}
              </div>

              {d.intervals.map((iv) => (
                <div
                  key={`${iv.start}-${iv.end}`}
                  className="absolute right-[3px] left-[3px] overflow-hidden rounded-[var(--radius-field)] border border-[color-mix(in_srgb,var(--color-primary)_28%,transparent)] bg-[color-mix(in_srgb,var(--color-primary)_12%,transparent)] px-1.5 py-1"
                  style={{
                    top: `${topOf(iv.start)}rem`,
                    height: `${Math.max(1.15, topOf(iv.end) - topOf(iv.start))}rem`,
                  }}
                >
                  {/* Start above, end below: the two numbers line up with the
                      block's own edges, which is what makes the block legible
                      without reading the gutter.

                      Hidden from assistive technology, and the range given
                      once as a phrase instead — two numbers read out in
                      sequence are not a span, and "09:00, 17:00" is not what
                      this block says. */}
                  <span
                    aria-hidden="true"
                    className="type-caption block leading-tight font-semibold tabular-nums text-[var(--color-primary)]"
                  >
                    {minutesToLabel(iv.start)}
                  </span>
                  <span
                    aria-hidden="true"
                    className="type-caption block leading-tight font-semibold tabular-nums text-[var(--color-primary)]"
                  >
                    {minutesToLabel(iv.end)}
                  </span>
                  <span className="sr-only">
                    {minutesToLabel(iv.start)}–{minutesToLabel(iv.end)}
                  </span>
                </div>
              ))}

              {/* The stripes say "nothing set here" to anyone who can see
                  them and nothing at all to anyone who cannot. */}
              {bare && <span className="sr-only">{t("availabilityPreviewReason.no-rule")}</span>}

              {closed && (
                <div
                  className="absolute inset-x-[3px] grid place-items-center rounded-[var(--radius-field)] border border-[color-mix(in_srgb,var(--color-destructive)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-destructive)_10%,transparent)]"
                  style={{ top: 0, height: gridHeight }}
                >
                  <span className="type-caption px-1 text-center font-medium text-[var(--color-destructive)]">
                    {t(`availabilityPreviewReason.${d.reason}`)}
                  </span>
                </div>
              )}
            </div>
          );
        })}

        <div />
        {/* One line of totals under the columns. A zero recedes rather than
            vanishing — a blank would leave ragged gaps in a row that reads as
            a single line. */}
        {ordered.map((d) => (
          <div
            key={d.date}
            className={cn(
              "type-caption truncate pt-2 text-center tabular-nums",
              totals.byDate[d.date]
                ? "font-semibold"
                : "text-[var(--color-muted-foreground)] opacity-55",
            )}
          >
            {totals.byDate[d.date] ? formatHours(totals.byDate[d.date]!, locale) : "0"}
          </div>
        ))}
      </div>

      <p className="type-caption flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[var(--color-muted-foreground)]">
        <span className="inline-flex items-center gap-1.5">
          <i
            aria-hidden="true"
            className="h-2.5 w-2.5 rounded-[3px] border border-[color-mix(in_srgb,var(--color-primary)_28%,transparent)] bg-[color-mix(in_srgb,var(--color-primary)_12%,transparent)]"
          />
          {t("availabilityLegendWorking")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i
            aria-hidden="true"
            className="h-2.5 w-2.5 rounded-[3px] border border-[color-mix(in_srgb,var(--color-destructive)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-destructive)_10%,transparent)]"
          />
          {t("availabilityLegendClosed")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i
            aria-hidden="true"
            className="h-2.5 w-2.5 rounded-[3px] border border-[var(--color-border)]"
            style={{ backgroundImage: STRIPES }}
          />
          {t("availabilityLegendNoRule")}
        </span>
      </p>
    </section>
  );
}
