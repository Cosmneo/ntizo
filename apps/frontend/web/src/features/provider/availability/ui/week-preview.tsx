import { useTranslation } from "react-i18next";
import { Lock } from "lucide-react";
import { cn, useIsMobile } from "@ntizo/frontend-ui";
import { WEEKDAY_ORDER, formatHours, minutesToLabel, weekdayShortLabel } from "../domain/week";
import { gridWindow, weekTotals } from "../domain/grid";
import type { ZonedNow } from "../domain/clock";
import type { PreviewDay } from "../domain/preview";

/**
 * The week those rules actually produce.
 *
 * The reference this came from previews what a generation job *will* write.
 * Here there is no job: the same functions that draw this grid are the ones
 * that answer a customer, so a provider is looking at the product rather than
 * at a forecast of it.
 *
 * **Two drawings, one dataset.** Above `md` the week is seven columns against
 * an hour ruler, which is the shape the question has — "is Thursday shorter
 * than Wednesday" is a comparison, and a comparison wants the two side by side.
 * On a phone that shape cannot survive: seven columns in 360px is 45px a day,
 * which fits neither a time nor a legible bar, and the sideways scroller it
 * used to fall back on hid three days off-screen with nothing saying they were
 * there. So the phone gets an agenda instead — one row per day, read top to
 * bottom, which is how a week is read on a phone everywhere else. Only one of
 * the two is ever mounted (`useIsMobile`, not a `hidden md:block` pair), so the
 * hours are never in the accessibility tree twice.
 *
 * An empty day is drawn rather than described. Striped means nothing is set; a
 * filled red block means the day is closed — the difference between "you have
 * not told us about Thursday" and "Thursday is a holiday", which are different
 * problems with different fixes.
 *
 * Displayed Monday-first while every stored `weekday` stays 0 = Sunday —
 * `WEEKDAY_ORDER` is the only place the two orders meet, and it is a display
 * concern alone.
 */

/** How much of the machinery under the hours is drawn. */
export type PreviewDensity = "hours" | "slots";

/** Height of one hour row. Rows are hourly, so the window is snapped to hours. */
const ROW_REM = 2.75;

/** A day with no rule at all, as a texture rather than a sentence. */
const STRIPES =
  "repeating-linear-gradient(135deg,transparent,transparent 7px,color-mix(in srgb,var(--color-foreground) 9%,transparent) 7px,color-mix(in srgb,var(--color-foreground) 9%,transparent) 8px)";

/** The hourly ruler behind every column, drawn as paint rather than as 77 elements. */
const HOUR_LINES = `repeating-linear-gradient(to bottom,var(--color-border) 0 1px,transparent 1px ${ROW_REM}rem)`;

export interface WeekPreviewProps {
  /** Seven days, in stored order — this component reorders them for display. */
  days: readonly PreviewDay[];
  locale: string;
  /**
   * Start minutes per date, from `previewSlots`. Omitted (or a date with no
   * entry) draws the working-hours block alone — no service selected is not an
   * error state, it is simply nothing more to add.
   */
  slotsByDate?: Readonly<Record<string, readonly number[]>>;
  /** Defaults to the plain hours — the slot ladder is opt-in, see the block comment below. */
  density?: PreviewDensity;
  /** Now in the *workspace's* zone, or `null`/omitted when it falls outside this week. */
  now?: ZonedNow | null;
}

/** The two drawings below get the defaults already resolved, never `undefined`. */
type ResolvedProps = Omit<WeekPreviewProps, "density" | "now"> & {
  density: PreviewDensity;
  now: ZonedNow | null;
  ordered: readonly PreviewDay[];
};

export function WeekPreview({ density = "hours", now = null, ...rest }: WeekPreviewProps) {
  const props = { ...rest, density, now };
  const { t } = useTranslation("provider");
  const isMobile = useIsMobile();

  const byWeekday = new Map(props.days.map((d) => [d.weekday, d]));
  const ordered = WEEKDAY_ORDER.map((w) => byWeekday.get(w)).filter(
    (d): d is PreviewDay => d !== undefined,
  );

  return (
    <section aria-label={t("availabilityPreviewTitle")} className="grid gap-3">
      {isMobile ? (
        <AgendaList {...props} ordered={ordered} />
      ) : (
        <HourGrid {...props} ordered={ordered} />
      )}
      <Legend />
    </section>
  );
}

/* ─────────────────────────── the wide drawing ─────────────────────────── */

function HourGrid({
  ordered,
  locale,
  slotsByDate,
  density,
  now,
  days,
}: ResolvedProps) {
  const { t } = useTranslation("provider");

  const window = gridWindow(days);
  const totals = weekTotals(days);
  const hourRows = Array.from(
    { length: (window.endMinute - window.startMinute) / 60 },
    (_, i) => window.startMinute + i * 60,
  );
  const gridHeight = `${hourRows.length * ROW_REM}rem`;
  const topOf = (minute: number) => ((minute - window.startMinute) / 60) * ROW_REM;
  const inWindow = (minute: number) =>
    minute >= window.startMinute && minute <= window.endMinute;

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[42rem] grid-cols-[3.25rem_repeat(7,minmax(0,1fr))]">
        <div />
        {ordered.map((d) => (
          <DayHeading key={d.date} day={d} locale={locale} today={now?.date === d.date} />
        ))}

        {/* Labels sit *on* their line rather than filling a row, which is what
            lets the closing hour be labelled at all — it is a boundary with no
            row of its own beneath it. */}
        <div className="relative" style={{ height: gridHeight }}>
          {[...hourRows, window.endMinute].map((m) => (
            <span
              key={m}
              className="type-caption absolute right-2.5 -translate-y-1/2 tabular-nums text-[var(--color-muted-foreground)]"
              style={{ top: `${topOf(m)}rem` }}
            >
              {minutesToLabel(m)}
            </span>
          ))}
        </div>

        {ordered.map((d) => {
          const closed = d.intervals.length === 0 && d.reason !== "no-rule" && d.reason !== null;
          const bare = d.intervals.length === 0 && d.reason === "no-rule";
          // Narrowed to a value rather than a boolean, so the marker below can
          // read `now.minute` without the compiler having to trust a flag.
          const nowHere = now && now.date === d.date ? now : null;
          const today = nowHere !== null;
          return (
            <div
              key={d.date}
              className={cn(
                "relative border-l border-[var(--color-border)] last-of-type:border-r",
                today && "bg-[color-mix(in_srgb,var(--color-primary)_4%,transparent)]",
              )}
              style={{
                height: gridHeight,
                backgroundImage: bare ? `${STRIPES},${HOUR_LINES}` : HOUR_LINES,
              }}
            >
              {d.intervals.map((iv) => (
                <WorkingBlock
                  key={`${iv.start}-${iv.end}`}
                  top={topOf(iv.start)}
                  height={Math.max(1.1, topOf(iv.end) - topOf(iv.start))}
                  start={iv.start}
                  end={iv.end}
                  slots={countSlotsIn(slotsByDate?.[d.date], iv.start, iv.end)}
                  density={density}
                />
              ))}

              {/* One hairline per bookable start, layered over the block above.
                  These were 3px bars in full brand blue, and ninety of them
                  across a working week turned every column into a barcode with
                  the hours themselves no longer readable underneath. A hairline
                  says the same thing — you can begin here — and ninety of them
                  read as a ruled block rather than as a pattern.

                  Hairlines rather than duration-tall rectangles for the reason
                  they always were: a start's own length is an hourly offer's
                  choice, not a single number `previewSlots` has to report.

                  `aria-hidden`: the count above states the total in words, and a
                  screen reader stepping through fifteen unlabelled ticks would
                  be noise, not information. */}
              {density === "slots" &&
                (slotsByDate?.[d.date] ?? []).map((start) => (
                  <div
                    key={start}
                    aria-hidden="true"
                    data-testid="slot-mark"
                    className="pointer-events-none absolute right-[5px] left-[5px] h-px bg-[color-mix(in_srgb,var(--color-primary)_38%,transparent)]"
                    style={{ top: `${topOf(start)}rem` }}
                  />
                ))}

              {/* The stripes say "nothing set here" to anyone who can see them
                  and nothing at all to anyone who cannot. */}
              {bare && <span className="sr-only">{t("availabilityPreviewReason.no-rule")}</span>}

              {closed && (
                <div
                  className="absolute inset-x-[3px] grid content-center justify-items-center gap-1 rounded-[var(--radius-field)] border border-[color-mix(in_srgb,var(--color-destructive)_28%,transparent)] px-1 text-center"
                  style={{
                    top: 0,
                    height: gridHeight,
                    backgroundImage:
                      "repeating-linear-gradient(135deg,color-mix(in srgb,var(--color-destructive) 7%,transparent) 0 8px,color-mix(in srgb,var(--color-destructive) 13%,transparent) 8px 16px)",
                  }}
                >
                  <Lock aria-hidden="true" className="h-3.5 w-3.5 text-[var(--color-destructive)]" />
                  <span className="type-caption font-medium text-[var(--color-destructive)]">
                    {t(`availabilityPreviewReason.${d.reason}`)}
                  </span>
                </div>
              )}

              {nowHere && inWindow(nowHere.minute) && (
                <div
                  aria-hidden="true"
                  data-testid="now-line"
                  className="pointer-events-none absolute -left-px z-10 h-0 w-[calc(100%+1px)] border-t-2 border-[var(--color-destructive)] before:absolute before:-top-[5px] before:-left-[3px] before:h-2 before:w-2 before:rounded-full before:bg-[var(--color-destructive)] before:content-['']"
                  style={{ top: `${topOf(nowHere.minute)}rem` }}
                />
              )}
            </div>
          );
        })}

        <div />
        {/* One line of totals under the columns. A zero recedes rather than
            vanishing — a blank would leave ragged gaps in a row that reads as a
            single line. */}
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
    </div>
  );
}

function DayHeading({
  day,
  locale,
  today,
}: {
  day: PreviewDay;
  locale: string;
  today: boolean;
}) {
  return (
    <div className="pb-2 text-center">
      {/* The short name in an element of its own, with nothing else in it —
          this is the label a reader scans the row by, and the date below is a
          different fact rather than a continuation of it. */}
      <b
        className={cn(
          "type-caption block font-medium",
          today ? "text-[var(--color-primary)]" : "text-[var(--color-foreground)]",
        )}
      >
        {weekdayShortLabel(locale, day.weekday)}
      </b>
      {/* Which week this is. A bare "Mon" is the same on all of them, and this
          grid is navigable. */}
      <span
        className={cn(
          "type-body-medium mt-0.5 inline-grid h-6 min-w-6 place-items-center rounded-full px-1.5 font-semibold tabular-nums",
          today
            ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
            : "text-[var(--color-muted-foreground)]",
        )}
      >
        {Number(day.date.slice(8))}
      </span>
    </div>
  );
}

function WorkingBlock({
  top,
  height,
  start,
  end,
  slots,
  density,
}: {
  top: number;
  height: number;
  start: number;
  end: number;
  slots: number;
  density: PreviewDensity;
}) {
  const { t } = useTranslation("provider");
  return (
    <div
      className="absolute right-[3px] left-[3px] overflow-hidden rounded-[var(--radius-field)] border border-[color-mix(in_srgb,var(--color-primary)_28%,transparent)] bg-[color-mix(in_srgb,var(--color-primary)_11%,transparent)] px-1.5 py-1 shadow-[inset_3px_0_0_-1px_var(--color-primary)]"
      style={{ top: `${top}rem`, height: `${height}rem` }}
    >
      {/* The span on one line rather than the two stacked numbers this
          replaced. Stacked, each number sat directly above a hairline of the
          grid behind it and read as underlined — which is most of why the old
          drawing looked broken rather than dense.

          Tight around the dash, and 11px: a day column is about 90px wide on a
          laptop once the rail and the app's own sidebar have taken their share,
          and "09:00 – 13:00" with spaces does not fit in it — it truncated to
          "09:00 – 13:…", which tells a reader when the block starts and lies
          about when it ends. One element, not a visible one plus an `sr-only`
          twin: the phrase is the same either way, and a duplicate is a second
          thing to keep in step for no gain. */}
      <span className="block truncate text-[11px] leading-tight font-semibold tabular-nums text-[var(--color-primary)]">
        {minutesToLabel(start)}–{minutesToLabel(end)}
      </span>
      {/* Only where there is room for it: a 45-minute window is two rows of
          text tall and the count would push the hours out of their own block. */}
      {density === "slots" && slots > 0 && height >= 2 * ROW_REM && (
        <span
          aria-hidden="true"
          className="type-caption absolute right-1 bottom-0.5 rounded-[4px] bg-[color-mix(in_srgb,var(--color-background)_80%,transparent)] px-1 text-[10px] font-semibold tabular-nums text-[var(--color-primary)]"
        >
          {t("availabilitySlotCount", { slots })}
        </span>
      )}
    </div>
  );
}

/* ────────────────────────── the phone drawing ─────────────────────────── */

/**
 * The same week as an agenda: one row a day, read downwards.
 *
 * Each row states its own total rather than deferring to a summary line, since
 * there is no column of totals to run along the bottom of a list — and the
 * number a provider is looking for on a phone is usually just "how long is
 * Thursday".
 */
function AgendaList({
  ordered,
  locale,
  slotsByDate,
  density,
  now,
  days,
}: ResolvedProps) {
  const { t } = useTranslation("provider");
  const totals = weekTotals(days);

  return (
    <ul className="grid gap-1.5">
      {ordered.map((d) => {
        const today = now?.date === d.date;
        const minutes = totals.byDate[d.date] ?? 0;
        const slots = slotsByDate?.[d.date]?.length ?? 0;
        return (
          <li
            key={d.date}
            className={cn(
              "flex items-start gap-3 rounded-[var(--radius-card-sm)] border px-3 py-2.5",
              today
                ? "border-[color-mix(in_srgb,var(--color-primary)_28%,transparent)] bg-[color-mix(in_srgb,var(--color-primary)_5%,transparent)]"
                : "border-[var(--color-border)]",
            )}
          >
            <div className="w-11 shrink-0 text-center">
              <b
                className={cn(
                  "type-caption block font-medium",
                  today ? "text-[var(--color-primary)]" : "text-[var(--color-foreground)]",
                )}
              >
                {weekdayShortLabel(locale, d.weekday)}
              </b>
              <span
                className={cn(
                  "type-body-medium mt-0.5 inline-grid h-6 min-w-6 place-items-center rounded-full px-1.5 font-semibold tabular-nums",
                  today
                    ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                    : "text-[var(--color-muted-foreground)]",
                )}
              >
                {Number(d.date.slice(8))}
              </span>
            </div>

            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 self-center">
              {d.intervals.length > 0 ? (
                d.intervals.map((iv) => (
                  <span
                    key={`${iv.start}-${iv.end}`}
                    className="type-caption rounded-[var(--radius-field)] border border-[color-mix(in_srgb,var(--color-primary)_28%,transparent)] bg-[color-mix(in_srgb,var(--color-primary)_11%,transparent)] px-2 py-1 font-semibold tabular-nums text-[var(--color-primary)]"
                  >
                    {minutesToLabel(iv.start)}–{minutesToLabel(iv.end)}
                  </span>
                ))
              ) : (
                <span
                  className={cn(
                    "type-caption",
                    d.reason === "no-rule"
                      ? "text-[var(--color-muted-foreground)]"
                      : "font-medium text-[var(--color-destructive)]",
                  )}
                >
                  {t(`availabilityPreviewReason.${d.reason ?? "no-rule"}`)}
                </span>
              )}
            </div>

            <div className="shrink-0 self-center text-right">
              <span
                className={cn(
                  "type-caption block tabular-nums",
                  minutes ? "font-semibold" : "text-[var(--color-muted-foreground)] opacity-55",
                )}
              >
                {minutes ? formatHours(minutes, locale) : "0"}
              </span>
              {density === "slots" && slots > 0 && (
                <span
                  aria-hidden="true"
                  className="type-caption block text-[10px] tabular-nums text-[var(--color-muted-foreground)]"
                >
                  {t("availabilitySlotCount", { slots })}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Legend() {
  const { t } = useTranslation("provider");
  return (
    <p className="type-caption flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[var(--color-muted-foreground)]">
      <span className="inline-flex items-center gap-1.5">
        <i
          aria-hidden="true"
          className="h-2.5 w-2.5 rounded-[3px] border border-[color-mix(in_srgb,var(--color-primary)_28%,transparent)] bg-[color-mix(in_srgb,var(--color-primary)_11%,transparent)]"
        />
        {t("availabilityLegendWorking")}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <i
          aria-hidden="true"
          className="h-2.5 w-2.5 rounded-[3px] border border-[color-mix(in_srgb,var(--color-destructive)_28%,transparent)] bg-[color-mix(in_srgb,var(--color-destructive)_10%,transparent)]"
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
      <span className="inline-flex items-center gap-1.5">
        <i aria-hidden="true" className="h-0.5 w-3 rounded-full bg-[var(--color-destructive)]" />
        {t("availabilityLegendNow")}
      </span>
    </p>
  );
}

/**
 * How many of a day's bookable starts fall inside one working block.
 *
 * A day can hold two blocks — a morning and an afternoon either side of lunch —
 * and `previewSlots` reports the day's starts as one flat list, so a block
 * cannot simply claim all of them. Half-open at the end: a start exactly on the
 * closing minute is not a slot this block sells.
 */
function countSlotsIn(starts: readonly number[] | undefined, from: number, to: number): number {
  if (!starts) return 0;
  return starts.filter((s) => s >= from && s < to).length;
}
