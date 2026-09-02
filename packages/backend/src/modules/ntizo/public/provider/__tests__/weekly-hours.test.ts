import { describe, expect, it } from "bun:test";
import { mergeIntervals, weeklyHoursFromRows } from "../app/use-cases/weekly-hours";

describe("mergeIntervals", () => {
  it("returns disjoint intervals untouched, in order", () => {
    expect(
      mergeIntervals([
        { startMinute: 960, endMinute: 1200 },
        { startMinute: 480, endMinute: 720 },
      ]),
    ).toEqual([
      { startMinute: 480, endMinute: 720 },
      { startMinute: 960, endMinute: 1200 },
    ]);
  });

  it("merges overlapping intervals", () => {
    expect(
      mergeIntervals([
        { startMinute: 480, endMinute: 780 },
        { startMinute: 720, endMinute: 1080 },
      ]),
    ).toEqual([{ startMinute: 480, endMinute: 1080 }]);
  });

  it("merges intervals that only touch", () => {
    // The two-member roster this whole function exists for: one works the
    // morning, one the afternoon, and the business is open all day. Left
    // unmerged this reads as two shifts with a seam at noon.
    expect(
      mergeIntervals([
        { startMinute: 480, endMinute: 720 },
        { startMinute: 720, endMinute: 1080 },
      ]),
    ).toEqual([{ startMinute: 480, endMinute: 1080 }]);
  });

  it("absorbs a fully contained interval", () => {
    expect(
      mergeIntervals([
        { startMinute: 480, endMinute: 1080 },
        { startMinute: 600, endMinute: 700 },
      ]),
    ).toEqual([{ startMinute: 480, endMinute: 1080 }]);
  });

  it("keeps a real gap as a gap", () => {
    // The case min/max would destroy: a lunch break becomes "open 08:00-20:00".
    expect(
      mergeIntervals([
        { startMinute: 480, endMinute: 720 },
        { startMinute: 960, endMinute: 1200 },
      ]),
    ).toEqual([
      { startMinute: 480, endMinute: 720 },
      { startMinute: 960, endMinute: 1200 },
    ]);
  });

  it("returns a single interval unchanged", () => {
    expect(mergeIntervals([{ startMinute: 540, endMinute: 840 }])).toEqual([
      { startMinute: 540, endMinute: 840 },
    ]);
  });

  it("returns nothing for nothing", () => {
    expect(mergeIntervals([])).toEqual([]);
  });

  it("does not mutate its input", () => {
    const input = [
      { startMinute: 960, endMinute: 1200 },
      { startMinute: 480, endMinute: 720 },
    ];
    mergeIntervals(input);
    expect(input[0]?.startMinute).toBe(960);
  });
});

describe("weeklyHoursFromRows", () => {
  it("always returns seven weekdays, in order", () => {
    const result = weeklyHoursFromRows([]);
    expect(result).toHaveLength(7);
    expect(result.map((d) => d.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(result.every((d) => d.intervals.length === 0)).toBe(true);
  });

  it("unions two members' rules for the same weekday", () => {
    const result = weeklyHoursFromRows([
      { weekday: 1, startMinute: 480, endMinute: 720 },
      { weekday: 1, startMinute: 720, endMinute: 1080 },
    ]);
    expect(result[1]).toEqual({
      weekday: 1,
      intervals: [{ startMinute: 480, endMinute: 1080 }],
    });
  });

  it("keeps weekdays apart", () => {
    const result = weeklyHoursFromRows([
      { weekday: 6, startMinute: 540, endMinute: 840 },
      { weekday: 1, startMinute: 480, endMinute: 1080 },
    ]);
    expect(result[6]?.intervals).toEqual([{ startMinute: 540, endMinute: 840 }]);
    expect(result[1]?.intervals).toEqual([{ startMinute: 480, endMinute: 1080 }]);
    expect(result[0]?.intervals).toEqual([]);
  });
});
