import { describe, expect, test } from "vitest";
import { freeIntervals, mergeIntervals, subtractIntervals } from "../intervals";

describe("mergeIntervals", () => {
  test("joins overlapping stretches into one", () => {
    expect(mergeIntervals([{ start: 480, end: 720 }, { start: 660, end: 840 }]))
      .toEqual([{ start: 480, end: 840 }]);
  });

  test("joins stretches that touch exactly", () => {
    expect(mergeIntervals([{ start: 480, end: 720 }, { start: 720, end: 840 }]))
      .toEqual([{ start: 480, end: 840 }]);
  });

  test("keeps a real gap", () => {
    expect(mergeIntervals([{ start: 480, end: 720 }, { start: 780, end: 1080 }]))
      .toEqual([{ start: 480, end: 720 }, { start: 780, end: 1080 }]);
  });

  test("sorts input it is given out of order", () => {
    expect(mergeIntervals([{ start: 780, end: 1080 }, { start: 480, end: 720 }]))
      .toEqual([{ start: 480, end: 720 }, { start: 780, end: 1080 }]);
  });

  test("drops an empty interval", () => {
    expect(mergeIntervals([{ start: 600, end: 600 }])).toEqual([]);
  });
});

describe("subtractIntervals", () => {
  test("a cut in the middle leaves two pieces", () => {
    expect(subtractIntervals([{ start: 480, end: 1080 }], [{ start: 600, end: 660 }]))
      .toEqual([{ start: 480, end: 600 }, { start: 660, end: 1080 }]);
  });

  test("a cut at the start shortens the front", () => {
    expect(subtractIntervals([{ start: 480, end: 1080 }], [{ start: 480, end: 540 }]))
      .toEqual([{ start: 540, end: 1080 }]);
  });

  test("a cut covering everything leaves nothing", () => {
    expect(subtractIntervals([{ start: 480, end: 1080 }], [{ start: 400, end: 1200 }]))
      .toEqual([]);
  });

  test("a cut outside changes nothing", () => {
    expect(subtractIntervals([{ start: 480, end: 1080 }], [{ start: 1100, end: 1200 }]))
      .toEqual([{ start: 480, end: 1080 }]);
  });

  test("two cuts apply cumulatively", () => {
    expect(
      subtractIntervals([{ start: 480, end: 1080 }], [
        { start: 540, end: 600 },
        { start: 900, end: 960 },
      ]),
    ).toEqual([
      { start: 480, end: 540 },
      { start: 600, end: 900 },
      { start: 960, end: 1080 },
    ]);
  });
});

describe("freeIntervals", () => {
  const weekly = [{ start: 480, end: 1080 }]; // 08:00-18:00

  test("a house closure empties a day the weekly pattern fills", () => {
    expect(freeIntervals({ houseClosed: true, exceptions: [], weekly, busy: [] })).toEqual([]);
  });

  test("a closed exception empties the day", () => {
    expect(
      freeIntervals({
        houseClosed: false,
        exceptions: [{ kind: "closed", start: null, end: null }],
        weekly,
        busy: [],
      }),
    ).toEqual([]);
  });

  test("a closed exception beats a custom one on the same date", () => {
    expect(
      freeIntervals({
        houseClosed: false,
        exceptions: [
          { kind: "custom", start: 540, end: 720 },
          { kind: "closed", start: null, end: null },
        ],
        weekly,
        busy: [],
      }),
    ).toEqual([]);
  });

  test("a custom exception replaces the weekly pattern rather than adding to it", () => {
    expect(
      freeIntervals({
        houseClosed: false,
        exceptions: [{ kind: "custom", start: 540, end: 720 }],
        weekly,
        busy: [],
      }),
    ).toEqual([{ start: 540, end: 720 }]);
  });

  test("several custom exceptions on one date merge", () => {
    expect(
      freeIntervals({
        houseClosed: false,
        exceptions: [
          { kind: "custom", start: 540, end: 720 },
          { kind: "custom", start: 900, end: 1020 },
        ],
        weekly,
        busy: [],
      }),
    ).toEqual([{ start: 540, end: 720 }, { start: 900, end: 1020 }]);
  });

  test("overlapping weekly rows merge into one interval", () => {
    expect(
      freeIntervals({
        houseClosed: false,
        exceptions: [],
        weekly: [{ start: 480, end: 720 }, { start: 660, end: 840 }],
        busy: [],
      }),
    ).toEqual([{ start: 480, end: 840 }]);
  });

  // Nothing supplies busy intervals until slice 4. Passing them by hand is
  // what proves the subtraction now rather than in a slice where nobody
  // remembers it was never exercised.
  test("busy time is subtracted", () => {
    expect(
      freeIntervals({ houseClosed: false, exceptions: [], weekly, busy: [{ start: 600, end: 660 }] }),
    ).toEqual([{ start: 480, end: 600 }, { start: 660, end: 1080 }]);
  });

  test("an empty weekly pattern gives an empty day", () => {
    expect(freeIntervals({ houseClosed: false, exceptions: [], weekly: [], busy: [] })).toEqual([]);
  });
});
