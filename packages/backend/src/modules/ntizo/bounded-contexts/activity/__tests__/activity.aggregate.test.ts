import { describe, expect, it } from "bun:test";
import { Activity } from "../domain/aggregates/activity.aggregate";

const base = {
  actorUserId: "u1",
  type: "service.published" as const,
  payload: { serviceName: "Corte de cabelo" },
  occurredAt: new Date("2026-08-26T10:00:00Z"),
};

describe("Activity.record", () => {
  it("keeps the payload it was given", () => {
    expect(Activity.record(base).payload).toEqual({ serviceName: "Corte de cabelo" });
  });

  it("refuses a type nobody can render", () => {
    // A row with an unknown type reaches the screen as its own key. Rejecting
    // it here means the write fails loudly instead of the reader seeing
    // "activityType.whatever" months later.
    expect(() =>
      Activity.record({ ...base, type: "service.renamed" as never }),
    ).toThrow(/unknown activity type/i);
  });

  it("refuses an empty actor", () => {
    // A row nobody owns is unreachable: the only query filters by actor.
    expect(() => Activity.record({ ...base, actorUserId: "  " })).toThrow(/actor/i);
  });

  it("keeps the event's own time rather than stamping now", () => {
    // A handler that runs late must not sort to the top of a history.
    expect(Activity.record(base).occurredAt.toISOString()).toBe("2026-08-26T10:00:00.000Z");
  });
});

describe("Activity.rehydrate", () => {
  // The repository reads a whole page of rows in one pass. If rehydrating a
  // row went through `record`, one row whose type was later dropped from
  // ACTIVITY_TYPES would throw on read and fail the entire page instead of
  // only itself — validation belongs on the way in, not on the way out.
  it("does not check the type the way record does", () => {
    expect(() => Activity.rehydrate({ ...base, type: "service.renamed" as never })).not.toThrow();
  });

  it("still refuses an unknown type from record", () => {
    expect(() => Activity.record({ ...base, type: "service.renamed" as never })).toThrow(
      /unknown activity type/i,
    );
  });

  it("carries the stored id through untouched", () => {
    expect(Activity.rehydrate({ ...base, id: "a1" }).id).toBe("a1");
  });
});
