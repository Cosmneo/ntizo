import { describe, expect, test } from "bun:test";
import { MemberSchedule } from "../domain/aggregates/member-schedule.aggregate";

const P = "11111111-1111-1111-1111-111111111111";
const M = "22222222-2222-2222-2222-222222222222";

/** The kit carries `code` beside `message` — asserting on the message matches nothing. */
async function codeOf(fn: () => unknown): Promise<string | undefined> {
  try {
    await fn();
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

describe("MemberSchedule", () => {
  test("starts empty", () => {
    const s = MemberSchedule.create(P, M);
    expect(s.weekly).toEqual([]);
    expect(s.exceptions).toEqual([]);
  });

  test("accepts a weekly pattern and gives every rule an id", () => {
    const s = MemberSchedule.create(P, M);
    s.setWeeklyPattern([
      { weekday: 1, startMinute: 480, endMinute: 720 },
      { weekday: 1, startMinute: 840, endMinute: 1080 },
    ]);
    expect(s.weekly).toHaveLength(2);
    expect(new Set(s.weekly.map((r) => r.id)).size).toBe(2);
  });

  test("replaces the whole pattern rather than appending to it", () => {
    const s = MemberSchedule.create(P, M);
    s.setWeeklyPattern([{ weekday: 1, startMinute: 480, endMinute: 720 }]);
    s.setWeeklyPattern([{ weekday: 2, startMinute: 600, endMinute: 660 }]);
    expect(s.weekly).toHaveLength(1);
    expect(s.weekly[0]!.weekday).toBe(2);
  });

  test("an empty pattern is accepted — it means this person works no fixed days", () => {
    const s = MemberSchedule.create(P, M);
    s.setWeeklyPattern([{ weekday: 1, startMinute: 480, endMinute: 720 }]);
    s.setWeeklyPattern([]);
    expect(s.weekly).toEqual([]);
  });

  test("refuses a rule ending at or before it starts", async () => {
    const s = MemberSchedule.create(P, M);
    expect(await codeOf(() => s.setWeeklyPattern([{ weekday: 1, startMinute: 720, endMinute: 720 }])))
      .toBe("AVAILABILITY_RULE_INVALID");
  });

  test("refuses a rule past midnight", async () => {
    const s = MemberSchedule.create(P, M);
    expect(await codeOf(() => s.setWeeklyPattern([{ weekday: 1, startMinute: 600, endMinute: 1500 }])))
      .toBe("AVAILABILITY_RULE_INVALID");
  });

  test("refuses a weekday outside 0-6", async () => {
    const s = MemberSchedule.create(P, M);
    expect(await codeOf(() => s.setWeeklyPattern([{ weekday: 7, startMinute: 600, endMinute: 660 }])))
      .toBe("AVAILABILITY_RULE_INVALID");
  });

  test("refuses a non-integer minute", async () => {
    const s = MemberSchedule.create(P, M);
    expect(await codeOf(() => s.setWeeklyPattern([{ weekday: 1, startMinute: 480.5, endMinute: 720 }])))
      .toBe("AVAILABILITY_RULE_INVALID");
  });

  test("adds a closed exception and returns its id", () => {
    const s = MemberSchedule.create(P, M);
    const id = s.addException({
      onDate: "2026-08-20", kind: "closed", startMinute: null, endMinute: null, note: "doctor",
    });
    expect(s.exceptions).toHaveLength(1);
    expect(s.exceptions[0]!.id).toBe(id);
  });

  test("refuses a closed exception carrying hours", async () => {
    const s = MemberSchedule.create(P, M);
    expect(
      await codeOf(() =>
        s.addException({
          onDate: "2026-08-20", kind: "closed", startMinute: 540, endMinute: 600, note: null,
        }),
      ),
    ).toBe("EXCEPTION_SHAPE_INVALID");
  });

  test("refuses a custom exception without hours", async () => {
    const s = MemberSchedule.create(P, M);
    expect(
      await codeOf(() =>
        s.addException({
          onDate: "2026-08-20", kind: "custom", startMinute: null, endMinute: null, note: null,
        }),
      ),
    ).toBe("EXCEPTION_SHAPE_INVALID");
  });

  test("refuses a date that is not a civil date", async () => {
    const s = MemberSchedule.create(P, M);
    expect(
      await codeOf(() =>
        s.addException({
          onDate: "20-08-2026", kind: "closed", startMinute: null, endMinute: null, note: null,
        }),
      ),
    ).toBe("EXCEPTION_SHAPE_INVALID");
  });

  test("allows two custom exceptions on the same date", () => {
    const s = MemberSchedule.create(P, M);
    s.addException({ onDate: "2026-08-22", kind: "custom", startMinute: 540, endMinute: 720, note: null });
    s.addException({ onDate: "2026-08-22", kind: "custom", startMinute: 900, endMinute: 1020, note: null });
    expect(s.exceptions).toHaveLength(2);
  });

  test("removes an exception by id", () => {
    const s = MemberSchedule.create(P, M);
    const id = s.addException({ onDate: "2026-08-20", kind: "closed", startMinute: null, endMinute: null, note: null });
    s.removeException(id);
    expect(s.exceptions).toEqual([]);
  });

  test("refuses to remove an exception that is not there", async () => {
    const s = MemberSchedule.create(P, M);
    expect(await codeOf(() => s.removeException("33333333-3333-3333-3333-333333333333")))
      .toBe("EXCEPTION_NOT_FOUND");
  });

  test("rehydrate then toJSON round-trips every field", () => {
    const props = {
      providerId: P,
      memberId: M,
      weekly: [{ id: "r1", weekday: 3, startMinute: 480, endMinute: 1080 }],
      exceptions: [
        { id: "e1", onDate: "2026-08-20", kind: "closed" as const, startMinute: null, endMinute: null, note: "doctor" },
      ],
    };
    expect(MemberSchedule.rehydrate(props).toJSON()).toEqual(props);
  });
});
