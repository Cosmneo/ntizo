import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@ntizo/frontend-ui";
import {
  dayLoad,
  fullDayStarts,
  isPast,
  type DayLoad,
} from "@/features/directory/availability/domain/day-strip";

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

/** What each band of `dayLoad` looks like. `closed` draws no bar at all — see below. */
const LOAD_COLOUR: Record<Exclude<DayLoad, "closed">, string> = {
  open: "bg-[var(--color-success)]",
  limited: "bg-[var(--color-warning)]",
  scarce: "bg-[var(--color-destructive)]",
};

/**
 * The month label and the week's seven days, each as a card: the weekday
 * letter, the date, a capacity bar and how many times are free on it.
 *
 * A week at a time, navigated with arrows rather than an
 * `IntersectionObserver`-driven infinite scroll — this screen has no "load
 * more" to page through, and the observer traps this project has already paid
 * for (a sentinel that fires once and stalls, one that never fires at all in
 * a hidden tab) only apply to a design this one deliberately isn't.
 *
 * **The count is the day's bookable start times**, straight off
 * `days[i].starts.length`. It answers the question a customer actually has
 * before they click — "is it worth opening this day at all" — which a bare
 * row of numbers could not, and it is the thing that replaces the greyed-out
 * "ocupado" slots the mockup drew: the availability response never carries a
 * time nobody is free at, so density is the only honest way to show a day
 * filling up.
 */
export function DateStrip({
  week,
  selectedDate,
  todayIso,
  locale,
  startsByDate,
  onSelectDate,
  onPreviousWeek,
  onNextWeek,
}: {
  week: readonly string[];
  selectedDate: string;
  todayIso: string;
  locale: string;
  /** How many bookable starts each date carries. A date absent from it has none. */
  startsByDate: ReadonlyMap<string, number>;
  onSelectDate: (dateIso: string) => void;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
}) {
  const { t } = useTranslation("directory");
  // The label follows the selected day, not the strip's first day: a week
  // that opens in August and closes in September reads most naturally as
  // "whichever month the day you're looking at belongs to".
  const monthLabel = formatDate(selectedDate, locale, { month: "long", year: "numeric" });

  const counts = week.map((dateIso) => startsByDate.get(dateIso) ?? 0);
  // The scale for every bar on screen, computed across the week on screen —
  // see `dayLoad` for why a fraction of this provider's own fullest day is
  // the only honest reading of "nearly gone".
  const fullDay = fullDayStarts(counts);

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

      <div className="grid grid-cols-7 gap-1.5">
        {week.map((dateIso, index) => {
          const count = counts[index] ?? 0;
          const past = isPast(dateIso, todayIso);
          const load = dayLoad(count, fullDay);
          const selected = dateIso === selectedDate;
          // A day with nothing free is not a choice, and neither is one that
          // has already happened. Both are drawn — a gap in the week reads as
          // a rendering fault — and neither is clickable.
          const closed = load === "closed";
          // A past day's emptiness is not the provider being full: the
          // projection drops starts that have gone, so every past day counts
          // zero whatever the provider's calendar said. Saying "fechado"
          // there would invent a closure, so a past day carries no caption at
          // all and is struck through instead.
          const caption = past
            ? null
            : closed
              ? t("availabilityDayClosed")
              : t("availabilityDayFree", { count });

          return (
            <button
              key={dateIso}
              type="button"
              disabled={past || closed}
              aria-pressed={selected}
              // The weekday letter and the caption are both inside the card,
              // but a button with an `aria-label` is announced by that label
              // alone — so it has to carry the whole card: the date in full
              // ("14" is not a date to anyone who cannot see the column it is
              // under) and how many times are free, which is the fact the
              // card exists to add.
              aria-label={[
                formatDate(dateIso, locale, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                }),
                caption,
              ]
                .filter(Boolean)
                .join(", ")}
              onClick={() => onSelectDate(dateIso)}
              className={cn(
                "grid gap-1 rounded-[var(--radius-card-sm)] border px-1 py-2 text-center transition-colors disabled:pointer-events-none",
                selected
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                  : "border-[var(--color-border)] hover:border-[var(--color-muted-foreground)]",
                (past || closed) && !selected && "opacity-45",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "type-caption uppercase",
                  !selected && "text-[var(--color-muted-foreground)]",
                )}
              >
                {formatDate(dateIso, locale, { weekday: "narrow" })}
              </span>
              <span
                aria-hidden="true"
                className={cn("text-base font-semibold", past && "line-through")}
              >
                {formatDate(dateIso, locale, { day: "numeric" })}
              </span>
              {/* Absent on a closed day rather than drawn empty: a bar at zero
                  reads as a bar that failed to load, where no bar at all reads
                  as a day with nothing on it. On the selected card the load
                  colour gives way to the card's own foreground: green on a
                  filled primary is unreadable, and the caption beside it
                  already carries the number the colour stands in for. */}
              <span
                aria-hidden="true"
                className={cn(
                  "h-1 rounded-full",
                  load === "closed"
                    ? "bg-transparent"
                    : selected
                      ? "bg-[var(--color-primary-foreground)]/30"
                      : "bg-[var(--color-muted)]",
                )}
              >
                {load !== "closed" && (
                  <span
                    className={cn(
                      "block h-1 rounded-full",
                      selected ? "bg-[var(--color-primary-foreground)]" : LOAD_COLOUR[load],
                    )}
                    style={{ width: `${Math.round((count / Math.max(fullDay, 1)) * 100)}%` }}
                  />
                )}
              </span>
              {/* A non-breaking space on a past day rather than nothing: an
                  empty inline element collapses to no height, and that card
                  would stand shorter than its six neighbours. */}
              <span
                aria-hidden="true"
                className={cn(
                  "type-caption leading-tight",
                  !selected && "text-[var(--color-muted-foreground)]",
                )}
              >
                {caption ?? "\u00a0"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
