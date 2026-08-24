import { describe, expect, test } from "vitest";
import { fixedStarts, hourlyStarts } from "../offers";

describe("fixedStarts", () => {
  const day = [{ start: 480, end: 1080 }]; // 08:00-18:00

  test("walks the grid, not the duration — 45 minutes on a 30 grid", () => {
    const starts = fixedStarts(day, { durationMinutes: 45, bufferMinutes: 0, gridMinutes: 30 });
    expect(starts.slice(0, 4)).toEqual([480, 510, 540, 570]); // 08:00 08:30 09:00 09:30
  });

  test("withholds the last start when duration plus buffer overruns closing", () => {
    // 17:30 + 45 + 0 = 18:15, past the 18:00 close.
    const starts = fixedStarts(day, { durationMinutes: 45, bufferMinutes: 0, gridMinutes: 30 });
    expect(starts.at(-1)).toBe(1020); // 17:00, which ends 17:45
  });

  test("the buffer is counted in what must fit", () => {
    // 17:00 + 45 + 30 = 18:15, so 16:30 becomes the last.
    const starts = fixedStarts(day, { durationMinutes: 45, bufferMinutes: 30, gridMinutes: 30 });
    expect(starts.at(-1)).toBe(990); // 16:30
  });

  test("the grid is anchored to midnight, not to the interval", () => {
    // The interval opens at 08:10 because something ended there.
    const starts = fixedStarts([{ start: 490, end: 1080 }], {
      durationMinutes: 45,
      bufferMinutes: 0,
      gridMinutes: 30,
    });
    expect(starts[0]).toBe(510); // 08:30, never 08:10
  });

  test("an interval too short for one appointment offers nothing", () => {
    expect(
      fixedStarts([{ start: 480, end: 500 }], {
        durationMinutes: 45,
        bufferMinutes: 0,
        gridMinutes: 30,
      }),
    ).toEqual([]);
  });

  test("each free interval is walked independently", () => {
    const starts = fixedStarts(
      [{ start: 480, end: 600 }, { start: 840, end: 960 }],
      { durationMinutes: 60, bufferMinutes: 0, gridMinutes: 60 },
    );
    expect(starts).toEqual([480, 540, 840, 900]);
  });

  test("the last start ending exactly at closing time is offered", () => {
    // 17:00 + 60 = 18:00, exactly the close.
    const starts = fixedStarts(day, { durationMinutes: 60, bufferMinutes: 0, gridMinutes: 30 });
    expect(starts.at(-1)).toBe(1020); // 17:00
  });

  test("the buffer is included in the span ending exactly at closing", () => {
    // 17:00 + 45 + 15 = 18:00, exactly the close.
    const starts = fixedStarts(day, { durationMinutes: 45, bufferMinutes: 15, gridMinutes: 30 });
    expect(starts.at(-1)).toBe(1020); // 17:00
  });
});

describe("hourlyStarts", () => {
  const day = [{ start: 480, end: 1080 }]; // 08:00-18:00

  test("offers a start every grid mark that fits the minimum", () => {
    const offers = hourlyStarts(day, {
      minMinutes: 180,
      stepMinutes: 30,
      bufferMinutes: 0,
      gridMinutes: 30,
    });
    expect(offers[0]).toEqual({ start: 480, maxMinutes: 600 }); // 08:00, up to 10h
    expect(offers.at(-1)).toEqual({ start: 900, maxMinutes: 180 }); // 15:00, exactly the minimum
  });

  test("the longest length is capped to the step ladder, not to the raw room", () => {
    // 08:00-17:50 leaves 590 minutes; from 180 in steps of 30 the ladder tops
    // out at 570, and 590 is not offerable because nobody could book it.
    const offers = hourlyStarts([{ start: 480, end: 1070 }], {
      minMinutes: 180,
      stepMinutes: 30,
      bufferMinutes: 0,
      gridMinutes: 30,
    });
    expect(offers[0]).toEqual({ start: 480, maxMinutes: 570 });
  });

  test("a window shorter than the minimum offers no start at all", () => {
    expect(
      hourlyStarts([{ start: 480, end: 600 }], {
        minMinutes: 180,
        stepMinutes: 30,
        bufferMinutes: 0,
        gridMinutes: 30,
      }),
    ).toEqual([]);
  });

  test("the buffer shortens what can be sold", () => {
    const offers = hourlyStarts(day, {
      minMinutes: 180,
      stepMinutes: 30,
      bufferMinutes: 60,
      gridMinutes: 30,
    });
    expect(offers[0]).toEqual({ start: 480, maxMinutes: 540 }); // 10h room less 1h buffer
    expect(offers.at(-1)).toEqual({ start: 840, maxMinutes: 180 }); // 14:00 + 3h + 1h = 18:00
  });

  test("the last start with minimum ending exactly at sellable end is offered", () => {
    // 14:00 + 180 min (3h) + 60 min (1h buffer) = 18:00 exactly.
    const offers = hourlyStarts(day, {
      minMinutes: 180,
      stepMinutes: 30,
      bufferMinutes: 60,
      gridMinutes: 30,
    });
    expect(offers.at(-1)).toEqual({ start: 840, maxMinutes: 180 });
  });
});

describe("a grid of zero", () => {
  const day = [{ start: 540, end: 1080 }]; // 09:00–18:00

  test("fixedStarts offers nothing rather than dividing by zero", () => {
    // Zero is a real answer — "I am open, there are no slots to pick" —
    // not a broken 30. It must be refused by decision, not by NaN
    // happening to fail a comparison.
    expect(fixedStarts(day, { durationMinutes: 30, bufferMinutes: 0, gridMinutes: 0 })).toEqual([]);
  });

  test("hourlyStarts offers nothing either", () => {
    expect(
      hourlyStarts(day, { minMinutes: 60, stepMinutes: 30, bufferMinutes: 0, gridMinutes: 0 }),
    ).toEqual([]);
  });

  test("a negative grid is refused the same way", () => {
    expect(fixedStarts(day, { durationMinutes: 30, bufferMinutes: 0, gridMinutes: -30 })).toEqual([]);
  });

  test("a real grid is untouched", () => {
    expect(fixedStarts(day, { durationMinutes: 30, bufferMinutes: 0, gridMinutes: 60 })).toEqual([
      540, 600, 660, 720, 780, 840, 900, 960, 1020,
    ]);
  });
});
