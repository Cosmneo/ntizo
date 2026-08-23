import { describe, expect, it } from "vitest";
import type { NotificationDTO } from "@ntizo/shared/read-models";
import { groupByDay } from "@/features/notifications/domain/inbox-groups";

function at(iso: string): NotificationDTO {
  return { id: iso, type: "WELCOME", payload: {}, createdAt: iso, read: false };
}

const TODAY = "2026-08-23T12:00:00.000Z";

describe("groupByDay", () => {
  it("puts this calendar day under today", () => {
    const groups = groupByDay([at("2026-08-23T08:00:00.000Z")], TODAY);
    expect(groups.map((g) => g.key)).toEqual(["today"]);
  });

  it("puts the previous calendar day under yesterday", () => {
    const groups = groupByDay([at("2026-08-22T23:59:00.000Z")], TODAY);
    expect(groups.map((g) => g.key)).toEqual(["yesterday"]);
  });

  it("puts anything older under earlier", () => {
    const groups = groupByDay([at("2026-08-01T10:00:00.000Z")], TODAY);
    expect(groups.map((g) => g.key)).toEqual(["earlier"]);
  });

  it("keeps the order it was given inside a group", () => {
    const groups = groupByDay([at("2026-08-23T10:00:00.000Z"), at("2026-08-23T08:00:00.000Z")], TODAY);
    expect(groups[0]!.items.map((i) => i.id)).toEqual([
      "2026-08-23T10:00:00.000Z",
      "2026-08-23T08:00:00.000Z",
    ]);
  });

  it("emits no empty groups", () => {
    // A heading with nothing under it reads as a section that failed to load.
    const groups = groupByDay([at("2026-08-01T10:00:00.000Z")], TODAY);
    expect(groups).toHaveLength(1);
  });

  it("returns nothing for an empty inbox", () => {
    expect(groupByDay([], TODAY)).toEqual([]);
  });
});
