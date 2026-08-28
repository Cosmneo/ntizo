import type { WeeklyHoursDTO } from "@ntizo/shared/read-models";
import { WEEKDAY_ORDER, weekdayLabel } from "@/shared/domain/week-format";

export interface HoursInterval {
  startMinute: number;
  endMinute: number;
}

export interface HoursRow {
  /** Stable across renders, unique within the list — the weekdays it covers. */
  key: string;
  /** "Segunda a sexta", or one weekday's own name. */
  label: string;
  /** Empty means closed. */
  intervals: HoursInterval[];
}

function signature(intervals: readonly HoursInterval[]): string {
  return intervals.map((i) => `${i.startMinute}-${i.endMinute}`).join(",");
}

/**
 * Seven weekdays as the two or three rows a person actually reads.
 *
 * Consecutive weekdays with identical hours collapse: "Segunda a sexta
 * 08:00 – 18:00" is how everybody writes opening hours, and seven rows saying
 * the same thing five times is a table pretending to be information.
 *
 * Monday-first, via `WEEKDAY_ORDER`, even though the DTO is indexed 0 = Sunday
 * to match what `member_availability` stores. Nowhere this product ships reads
 * a week as starting on Sunday, and the grouping has to run in display order or
 * a Monday-to-Friday run would be split by the Sunday sitting between them.
 *
 * Only *consecutive* days merge. A business open Monday and Wednesday on the
 * same hours gets two rows, because "Monday and Wednesday" is a list, and the
 * moment a list has three entries it is longer than the rows it replaced.
 */
export function groupWeekdays(
  hours: readonly WeeklyHoursDTO[],
  locale: string,
): HoursRow[] {
  interface Draft {
    weekdays: number[];
    signature: string;
    intervals: HoursInterval[];
  }

  const byWeekday = new Map(hours.map((h) => [h.weekday, h.intervals]));
  const drafts: Draft[] = [];

  for (const weekday of WEEKDAY_ORDER) {
    const intervals = byWeekday.get(weekday) ?? [];
    const key = signature(intervals);
    const previous = drafts[drafts.length - 1];

    if (previous && previous.signature === key) {
      previous.weekdays.push(weekday);
      continue;
    }

    drafts.push({
      weekdays: [weekday],
      signature: key,
      intervals: intervals.map((interval) => ({ ...interval })),
    });
  }

  return drafts.map(({ weekdays, intervals }) => {
    const first = weekdays[0]!;
    const last = weekdays[weekdays.length - 1]!;
    return {
      key: weekdays.join("-"),
      label:
        weekdays.length === 1
          ? weekdayLabel(locale, first)
          : // `Intl.ListFormat` would give "Monday, Tuesday, …, Friday". A
            // range is how opening hours are written, and the two endpoints
            // are the only thing the reader needs.
            `${weekdayLabel(locale, first)} ${rangeWord(locale)} ${weekdayLabel(locale, last)}`,
      intervals,
    };
  });
}

/**
 * The word between the two ends of a weekday range.
 *
 * There is no `Intl` primitive for "Monday **to** Friday" — `ListFormat` builds
 * conjunctions, not ranges, and `DateTimeFormat.formatRange` needs two dates
 * and produces "Mon – Fri" with a dash rather than a word. So this is a small
 * table, and the fallback is the dash, which is never wrong in any language
 * even where it is not idiomatic.
 */
function rangeWord(locale: string): string {
  const lang = locale.split("-")[0];
  const words: Record<string, string> = {
    pt: "a", en: "to", es: "a", fr: "au", de: "bis", it: "a", nl: "tot",
  };
  return words[lang ?? ""] ?? "–";
}

/**
 * Whether this business has published any hours at all.
 *
 * A provider who never configured availability comes back as seven closed days,
 * which is indistinguishable from a business that is genuinely never open —
 * except that one of those is a fact and the other is an empty form. The card
 * uses this to say "not published yet" instead of printing seven "Fechado"s.
 */
export function hasAnyHours(hours: readonly WeeklyHoursDTO[]): boolean {
  return hours.some((day) => day.intervals.length > 0);
}
