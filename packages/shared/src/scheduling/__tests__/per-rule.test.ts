import { describe, expect, test } from "vitest";
import { startsForDay, type DayRule, type Offer } from "../per-rule";

const bare = { bufferMinutes: null, slotIntervalMinutes: null, capacity: null };
const rule = (startMinute: number, endMinute: number, over: Partial<DayRule> = {}): DayRule => ({
  ...bare,
  startMinute,
  endMinute,
  ...over,
});
const fixed30: Offer = { kind: "fixed", durationMinutes: 30 };
const base = { houseClosed: false, exceptions: [], offer: fixed30, busy: [] };

describe("startsForDay", () => {
  test("one plain rule is the engine's own answer", () => {
    // 09:00–11:00, 30-minute service, default 30 grid, no buffer.
    const starts = startsForDay({ ...base, rules: [rule(540, 660)] });
    expect([...starts.keys()]).toEqual([540, 570, 600, 630]);
  });

  test("two rules on one day keep their own grids", () => {
    // THE regression test. Merged into one 09:00–13:00 interval, the
    // afternoon's 60-minute grid would be lost and every start would land
    // on 30.
    const starts = startsForDay({
      ...base,
      rules: [
        rule(540, 660, { slotIntervalMinutes: 30 }), // 09:00–11:00 every 30
        rule(660, 780, { slotIntervalMinutes: 60 }), // 11:00–13:00 every 60
      ],
    });
    expect([...starts.keys()]).toEqual([540, 570, 600, 630, 660, 720]);
  });

  test("a rule with a zero grid contributes nothing", () => {
    const starts = startsForDay({
      ...base,
      rules: [rule(540, 660, { slotIntervalMinutes: 0 })],
    });
    expect(starts.size).toBe(0);
  });

  test("an open rule beside a slotted one leaves the slotted one alone", () => {
    // 660–720 (11:00–12:00) at the default 30 grid offers both 660 and 690;
    // the point is that neither of them is disturbed by the open rule
    // beside it, not that there is only one.
    const starts = startsForDay({
      ...base,
      rules: [rule(540, 660, { slotIntervalMinutes: 0 }), rule(660, 720, {})],
    });
    expect([...starts.keys()]).toEqual([660, 690]);
  });

  test("overlapping rules offer a start once, at the larger capacity", () => {
    const starts = startsForDay({
      ...base,
      rules: [rule(540, 600, { capacity: 2 }), rule(540, 600, { capacity: 5 })],
    });
    expect([...starts.keys()]).toEqual([540, 570]);
    expect(starts.get(540)!.seatsLeft).toBe(5);
  });

  test("capacity defaults to one", () => {
    const starts = startsForDay({ ...base, rules: [rule(540, 600)] });
    expect(starts.get(540)!.seatsLeft).toBe(1);
  });

  test("a house closure empties the day whatever the rules say", () => {
    const starts = startsForDay({ ...base, houseClosed: true, rules: [rule(540, 1080)] });
    expect(starts.size).toBe(0);
  });

  test("a closed exception empties the day", () => {
    const starts = startsForDay({
      ...base,
      exceptions: [{ kind: "closed", start: null, end: null }],
      rules: [rule(540, 1080)],
    });
    expect(starts.size).toBe(0);
  });

  test("a custom exception replaces the weekly rules, keeping their shape", () => {
    // The precedence chain still belongs to `freeIntervals`; this only
    // proves it is still being asked.
    const starts = startsForDay({
      ...base,
      exceptions: [{ kind: "custom", start: 600, end: 660 }],
      rules: [rule(540, 1080, { slotIntervalMinutes: 60 })],
    });
    expect([...starts.keys()]).toEqual([600]);
  });

  test("the buffer eats the last start, not the first", () => {
    // 09:00–10:00, 30-minute service, 15-minute buffer: 09:00 fits
    // (ends 09:45), 09:30 does not (would end 10:15).
    const starts = startsForDay({
      ...base,
      rules: [rule(540, 600, { bufferMinutes: 15 })],
    });
    expect([...starts.keys()]).toEqual([540]);
  });

  test("a fixed offer reports no maxMinutes — one knowable length, nothing to cap", () => {
    const starts = startsForDay({ ...base, rules: [rule(540, 600)] });
    expect(starts.get(540)!.maxMinutes).toBeNull();
  });

  describe("hourly offer", () => {
    const hourlyBase = { houseClosed: false, exceptions: [], busy: [] };

    test("an hourly rule honours its own grid, not the fixed default", () => {
      // 09:00–11:00 on a 45-minute grid: 09:00, 09:45, 10:30 all leave room
      // for the 30-minute minimum. A 30-minute default grid would insert
      // 09:30 and 10:00, which this rule never offered.
      const starts = startsForDay({
        ...hourlyBase,
        offer: { kind: "hourly", minMinutes: 30, stepMinutes: 30 },
        rules: [rule(540, 660, { slotIntervalMinutes: 45 })],
      });
      expect([...starts.keys()]).toEqual([540, 585, 630]);
    });

    test("an hourly start reports its own rule's maximum, not the bare minimum", () => {
      // 09:00–11:00, 30-minute minimum, 30-minute steps, no buffer: 09:00
      // has the full two hours of room, so its ceiling is 120 — the room
      // rounded down to the step ladder — not the 30-minute floor.
      const starts = startsForDay({
        ...hourlyBase,
        offer: { kind: "hourly", minMinutes: 30, stepMinutes: 30 },
        rules: [rule(540, 660)],
      });
      expect(starts.get(540)!.maxMinutes).toBe(120);
    });

    test("an hourly start's occupied span is its minimum length plus buffer, not its full ceiling", () => {
      // 09:00–11:00, 15-minute buffer, 30-minute minimum, 30-minute step:
      // 09:00 could sell up to 90 minutes (its maxMinutes), but what it
      // actually holds once booked at the minimum is only 30 + 15 = 45
      // minutes, 09:00–09:45 — the same "smallest sellable block" notion
      // `hourlyStarts` itself uses. A booking at 10:00–10:15 sits inside the
      // room a longer booking could have used, but outside that 45-minute
      // span, so 09:00 stays offered.
      const starts = startsForDay({
        ...hourlyBase,
        offer: { kind: "hourly", minMinutes: 30, stepMinutes: 30 },
        rules: [rule(540, 660, { bufferMinutes: 15 })],
        busy: [{ start: 600, end: 615 }],
      });
      expect(starts.has(540)).toBe(true);
    });
  });

  describe("capacity against bookings", () => {
    test("capacity one behaves exactly as subtracting busy did", () => {
      // The migration's safety net: today's engine removes a start whose span
      // overlaps a booking, and so must this.
      const starts = startsForDay({
        ...base,
        rules: [rule(540, 660)],
        busy: [{ start: 570, end: 600 }], // 09:30–10:00 booked
      });
      expect([...starts.keys()]).toEqual([540, 600, 630]);
    });

    test("a start with room left is still offered, and says how much", () => {
      const starts = startsForDay({
        ...base,
        rules: [rule(540, 600, { capacity: 3 })],
        busy: [{ start: 540, end: 570 }], // one of three chairs taken
      });
      expect(starts.get(540)!.seatsLeft).toBe(2);
    });

    test("a full start disappears", () => {
      const starts = startsForDay({
        ...base,
        rules: [rule(540, 600, { capacity: 2 })],
        busy: [
          { start: 540, end: 570 },
          { start: 540, end: 570 },
        ],
      });
      expect(starts.has(540)).toBe(false);
    });

    test("the buffer is occupied but not sold, so a booking inside it collides", () => {
      // A 09:00 start of a 30-minute service with a 15-minute buffer occupies
      // 540–585 (09:00–09:45). A booking at 570–585 (09:30–09:45) lands inside
      // that span — in the buffer, not in the appointment — and still takes the
      // seat, because the buffer is time nobody else can have.
      const starts = startsForDay({
        ...base,
        rules: [rule(540, 720, { bufferMinutes: 15 })],
        busy: [{ start: 570, end: 585 }],
      });
      expect(starts.has(540)).toBe(false);
    });

    test("a booking starting exactly where the buffer ends does not collide", () => {
      // 585 is the first minute the span no longer covers. Half-open on
      // purpose: `b.start < to && from < b.end`.
      const starts = startsForDay({
        ...base,
        rules: [rule(540, 720, { bufferMinutes: 15 })],
        busy: [{ start: 585, end: 600 }],
      });
      expect(starts.has(540)).toBe(true);
    });

    test("no bookings leaves every start at full capacity", () => {
      const starts = startsForDay({ ...base, rules: [rule(540, 600, { capacity: 4 })], busy: [] });
      expect(starts.get(540)!.seatsLeft).toBe(4);
    });
  });
});
