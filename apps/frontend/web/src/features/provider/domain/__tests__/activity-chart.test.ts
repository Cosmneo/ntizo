import { describe, expect, it } from "vitest";
import {
  CHART,
  barPath,
  chartGeometry,
  chartTicks,
  seriesTotals,
  tooltipPlacement,
} from "../activity-chart";

/**
 * Thirty consecutive days ending on 2026-09-03, oldest first — the shape the
 * stats read returns. Stepped through UTC rather than string arithmetic so
 * every date is a real one across the month boundary.
 */
const days = Array.from({ length: 30 }, (_, i) => {
  const date = new Date(Date.UTC(2026, 7, 5));
  date.setUTCDate(date.getUTCDate() + i);
  return {
    date: date.toISOString().slice(0, 10),
    requests: i === 29 ? 4 : 0,
    confirmed: i === 29 ? 2 : 0,
  };
});

describe("chartGeometry", () => {
  it("draws two bars a day and nothing for a day with nothing", () => {
    const { bars, groups, max } = chartGeometry(days);
    expect(groups).toHaveLength(30);
    expect(max).toBe(4);
    // Only the last day has anything: two bars, not sixty.
    expect(bars).toHaveLength(2);
    expect(bars.map((b) => b.series)).toEqual(["requests", "confirmed"]);
  });

  it("scales the tallest bar to the plot and anchors every bar to the baseline", () => {
    const { bars } = chartGeometry(days);
    const tallest = bars.find((b) => b.series === "requests")!;
    const baseline = CHART.height - CHART.padBottom;
    expect(tallest.y + tallest.height).toBeCloseTo(baseline, 5);
    expect(tallest.height).toBeCloseTo(CHART.height - CHART.padTop - CHART.padBottom, 5);
  });

  it("gives a day with a single booking a bar you can see", () => {
    // A busy day beside the quiet one is what makes this test able to fail.
    // At a max of 200 the single booking's natural height is
    // (1 / 200) * 166 ≈ 0.83px — a bar nobody could see, so the floor has to
    // do something. Against the window's own max of 4 it would come out at
    // ~41px and pass whether the floor existed or not.
    const requestsOn = (i: number, fallback: number) => {
      if (i === 0) return 1;
      if (i === 29) return 200;
      return fallback;
    };
    const one = days.map((d, i) => ({
      ...d,
      requests: requestsOn(i, d.requests),
      confirmed: i === 0 ? 0 : d.confirmed,
    }));
    const { bars, max } = chartGeometry(one);
    expect(max).toBe(200);
    const first = bars.find((b) => b.key.startsWith(one[0]!.date))!;
    expect(first.height).toBe(CHART.minBar);
  });

  it("never divides by zero on a month with no bookings", () => {
    const empty = days.map((d) => ({ ...d, requests: 0, confirmed: 0 }));
    const { bars, max } = chartGeometry(empty);
    expect(max).toBe(1);
    expect(bars).toHaveLength(0);
  });
});

describe("barPath", () => {
  it("rounds the top and leaves the base square", () => {
    const d = barPath(10, 20, 8, 40, 4);
    expect(d.startsWith("M10,60")).toBe(true); // the baseline corner
    expect(d).toContain("Q"); // two rounded shoulders
    expect(d.trimEnd().endsWith("Z")).toBe(true);
  });

  it("never rounds more than the bar can carry", () => {
    expect(barPath(0, 0, 3, 2, 4)).toContain("Q");
  });
});

describe("seriesTotals and chartTicks", () => {
  it("adds each series over the window", () => {
    expect(seriesTotals(days)).toEqual({ requests: 4, confirmed: 2 });
  });

  it("labels the first, middle and last day and nothing else", () => {
    const ticks = chartTicks(days, "pt-MZ");
    expect(ticks).toHaveLength(3);
    expect(ticks[0]!.index).toBe(0);
    expect(ticks.at(-1)!.index).toBe(29);
    expect(ticks[0]!.label.length).toBeGreaterThan(0);
  });
});

describe("tooltipPlacement", () => {
  /**
   * The anchor and the shift are the same number, which is what contains the
   * label: its left edge lands at `centre × (card − tooltip)` and its right
   * at `card − (1 − centre) × (card − tooltip)`, both inside the card for any
   * label no wider than it. A flat `translateX(-50%)` — what this replaced —
   * put half of day one's label outside the card entirely.
   */
  it("shifts each day by its own position, so the label never crosses an edge", () => {
    const { groups } = chartGeometry(days);
    for (const group of groups) {
      const { left, transform } = tooltipPlacement(group.x, group.width);
      expect(transform).toBe(`translateX(-${left})`);
      const centre = Number.parseFloat(left);
      expect(centre).toBeGreaterThanOrEqual(0);
      expect(centre).toBeLessThanOrEqual(100);
    }
  });

  it("keeps the middle of the window centred and pins the two ends", () => {
    const { groups } = chartGeometry(days);
    expect(tooltipPlacement(groups[0]!.x, groups[0]!.width).left).toBe("1.67%");
    expect(tooltipPlacement(groups[15]!.x, groups[15]!.width).left).toBe("51.67%");
    expect(tooltipPlacement(groups[29]!.x, groups[29]!.width).left).toBe("98.33%");
  });
});
