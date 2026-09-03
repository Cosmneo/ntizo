import type { ProviderBookingStatsDayDTO } from "@ntizo/shared/read-models";

/**
 * The chart's coordinate space. Fixed, and scaled by CSS: the SVG is drawn
 * once at this size and `width: 100%` shrinks it, so the bars keep their
 * proportions on a phone. The labels are HTML, outside the SVG, so they keep
 * their type size when the drawing shrinks.
 */
export const CHART = {
  width: 640,
  height: 176,
  padTop: 10,
  padBottom: 0,
  /** Between the two bars of one day, and between one day and the next. */
  gap: 2,
  groupGap: 6,
  radius: 4,
  /** A day with one booking must not draw a bar nobody can see. */
  minBar: 3,
} as const;

export type ChartSeries = "requests" | "confirmed";

export interface ChartBar {
  key: string;
  series: ChartSeries;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartGroup {
  day: ProviderBookingStatsDayDTO;
  /** The whole day's slice of the plot — the hover target, not the bars. */
  x: number;
  width: number;
}

/**
 * Bars for the days that have something, groups for all of them.
 *
 * `max` floors at 1 so a month with no bookings divides by something, and an
 * empty day contributes no bar at all: a zero-height rectangle is invisible
 * anyway, and leaving it out halves the element count on a quiet month.
 */
export function chartGeometry(days: readonly ProviderBookingStatsDayDTO[]): {
  bars: ChartBar[];
  groups: ChartGroup[];
  max: number;
} {
  const view = CHART;
  const plot = view.height - view.padTop - view.padBottom;
  const groupWidth = view.width / Math.max(days.length, 1);
  const barWidth = Math.max((groupWidth - view.groupGap - view.gap) / 2, 1);
  const max = Math.max(1, ...days.flatMap((d) => [d.requests, d.confirmed]));

  const bars: ChartBar[] = [];
  const groups: ChartGroup[] = [];

  days.forEach((day, i) => {
    const x = i * groupWidth;
    groups.push({ day, x, width: groupWidth });

    const put = (series: ChartSeries, value: number, offset: number) => {
      if (value <= 0) return;
      const height = Math.max((value / max) * plot, view.minBar);
      bars.push({
        key: `${day.date}-${series}`,
        series,
        x: x + view.groupGap / 2 + offset,
        y: view.padTop + plot - height,
        width: barWidth,
        height,
      });
    };

    put("requests", day.requests, 0);
    put("confirmed", day.confirmed, barWidth + view.gap);
  });

  return { bars, groups, max };
}

/** A bar with a rounded top and a square base, anchored to the baseline. */
export function barPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(Math.min(r, w / 2, h), 0.5);
  const bottom = y + h;
  return `M${x},${bottom} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${bottom} Z`;
}

export function seriesTotals(days: readonly ProviderBookingStatsDayDTO[]): {
  requests: number;
  confirmed: number;
} {
  return days.reduce(
    (acc, d) => ({ requests: acc.requests + d.requests, confirmed: acc.confirmed + d.confirmed }),
    { requests: 0, confirmed: 0 },
  );
}

/** Three labels — the window's ends and its middle. Thirty would be a wall of text on a phone. */
export function chartTicks(
  days: readonly ProviderBookingStatsDayDTO[],
  locale: string,
): { index: number; label: string }[] {
  if (days.length === 0) return [];
  const format = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  return [0, Math.floor((days.length - 1) / 2), days.length - 1].map((index) => ({
    index,
    label: format.format(new Date(`${days[index]!.date}T00:00:00.000Z`)),
  }));
}
