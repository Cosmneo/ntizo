import { describe, expect, test } from "bun:test";
import { MemberSchedule } from "../domain/aggregates/member-schedule.aggregate";
import { toDomain, toRows } from "../infrastructure/repositories/drizzle/member-schedule.mapper";

describe("member schedule mapper", () => {
  test("round-trips every field of a fully populated schedule", () => {
    const original = MemberSchedule.rehydrate({
      providerId: "11111111-1111-1111-1111-111111111111",
      memberId: "22222222-2222-2222-2222-222222222222",
      weekly: [
        { id: "aaaaaaaa-0000-0000-0000-000000000001", weekday: 1, startMinute: 480, endMinute: 720 },
        { id: "aaaaaaaa-0000-0000-0000-000000000002", weekday: 1, startMinute: 840, endMinute: 1080 },
        { id: "aaaaaaaa-0000-0000-0000-000000000003", weekday: 6, startMinute: 540, endMinute: 1440 },
      ],
      exceptions: [
        { id: "bbbbbbbb-0000-0000-0000-000000000001", onDate: "2026-08-20", kind: "closed", startMinute: null, endMinute: null, note: "doctor" },
        { id: "bbbbbbbb-0000-0000-0000-000000000002", onDate: "2026-08-22", kind: "custom", startMinute: 540, endMinute: 720, note: null },
      ],
    });

    const rows = toRows(original);
    const back = toDomain(original.providerId, original.memberId, rows.weekly, rows.exceptions);

    // The whole object, so a field added later and forgotten in the mapper
    // fails here without anyone remembering to extend this test.
    expect(back.toJSON()).toEqual(original.toJSON());
  });

  test("an empty schedule round-trips to an empty schedule", () => {
    const empty = MemberSchedule.create(
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
    );
    const rows = toRows(empty);
    expect(toDomain(empty.providerId, empty.memberId, rows.weekly, rows.exceptions).toJSON())
      .toEqual(empty.toJSON());
  });
});
