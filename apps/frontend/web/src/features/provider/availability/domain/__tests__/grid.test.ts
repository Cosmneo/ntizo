import { describe, expect, test } from "vitest";
import { gridWindow, weekTotals, FALLBACK_WINDOW } from "../grid";
import type { PreviewDay } from "../preview";

/**
 * The two answers the redesigned week needs before it can draw anything: how
 * tall the grid is, and what the week adds up to.
 *
 * The old grid was 06:00–24:00 for everybody — eighteen rows, nearly all of
 * them permanently empty, which is what forced the seven columns past the
 * width of the page and hid Friday, Saturday and Sunday behind a sideways
 * scroll. These functions exist so the grid can be as tall as the hours
 * actually in play and no taller.
 */

const day = (
  weekday: number,
  intervals: [number, number][],
  reason: PreviewDay["reason"] = null,
): PreviewDay => ({
  date: `2026-08-${String(10 + weekday).padStart(2, "0")}`,
  weekday,
  intervals: intervals.map(([start, end]) => ({ start, end })),
  reason: intervals.length === 0 ? reason : null,
});

describe("gridWindow", () => {
  test("gives an hour of air on each side of the hours in play", () => {
    // 09:00–17:00 worked → 08:00–18:00 drawn.
    const window = gridWindow([day(1, [[540, 1020]])]);

    expect(window).toEqual({ startMinute: 480, endMinute: 1080 });
  });

  test("spans the earliest start and the latest end across the whole week", () => {
    const window = gridWindow([
      day(1, [[540, 1020]]),
      day(2, [[480, 840]]),
      day(3, [[600, 1140]]),
    ]);

    expect(window).toEqual({ startMinute: 420, endMinute: 1200 });
  });

  test("snaps a part-hour start down and a part-hour end up to whole hours", () => {
    // 09:30–17:30 → the row labels stay on the hour, so the window has to.
    const window = gridWindow([day(1, [[570, 1050]])]);

    expect(window).toEqual({ startMinute: 480, endMinute: 1140 });
  });

  test("never runs past midnight at either end", () => {
    const window = gridWindow([day(1, [[30, 1410]])]);

    expect(window.startMinute).toBe(0);
    expect(window.endMinute).toBe(1440);
  });

  test("falls back to a working-day window when nothing is set at all", () => {
    // A brand-new provider has no rules. An empty grid still has to have a
    // height, and eighteen rows of nothing is the shape being replaced.
    expect(gridWindow([])).toEqual(FALLBACK_WINDOW);
    expect(gridWindow([day(1, [], "no-rule"), day(2, [], "no-rule")])).toEqual(FALLBACK_WINDOW);
  });

  test("the fallback is narrower than the old fixed grid", () => {
    // The whole point. 06:00–24:00 was eighteen rows.
    const rows = (FALLBACK_WINDOW.endMinute - FALLBACK_WINDOW.startMinute) / 60;
    expect(rows).toBeLessThan(18);
  });

  test("ignores the days that are empty when others are not", () => {
    const window = gridWindow([day(1, [[540, 1020]]), day(2, [], "member-closed")]);

    expect(window).toEqual({ startMinute: 480, endMinute: 1080 });
  });
});

describe("weekTotals", () => {
  test("adds up every interval in the week", () => {
    const totals = weekTotals([
      day(1, [[540, 1020]]), // 8h
      day(3, [[540, 1020]]), // 8h
      day(5, [[540, 780]]), // 4h
    ]);

    expect(totals.totalMinutes).toBe(20 * 60);
  });

  test("counts a day with two stretches once", () => {
    // A split shift is one working day, not two.
    const totals = weekTotals([
      day(1, [
        [540, 720],
        [840, 1020],
      ]),
    ]);

    expect(totals.workingDays).toBe(1);
    expect(totals.totalMinutes).toBe(6 * 60);
  });

  test("does not count an empty day as a working day", () => {
    const totals = weekTotals([day(1, [[540, 1020]]), day(2, [], "no-rule")]);

    expect(totals.workingDays).toBe(1);
  });

  test("reports each day's own total, keyed by its date", () => {
    const totals = weekTotals([day(1, [[540, 1020]]), day(2, [[480, 600]])]);

    expect(totals.byDate["2026-08-11"]).toBe(8 * 60);
    expect(totals.byDate["2026-08-12"]).toBe(2 * 60);
  });

  test("gives an empty day a zero rather than leaving it out", () => {
    // The column still needs a number under it; a missing key would render
    // as blank and read as "not calculated" rather than "none".
    const totals = weekTotals([day(1, [], "no-rule")]);

    expect(totals.byDate["2026-08-11"]).toBe(0);
  });

  test("an empty week is zero everywhere, not NaN", () => {
    const totals = weekTotals([]);

    expect(totals.totalMinutes).toBe(0);
    expect(totals.workingDays).toBe(0);
    expect(totals.byDate).toEqual({});
  });
});
