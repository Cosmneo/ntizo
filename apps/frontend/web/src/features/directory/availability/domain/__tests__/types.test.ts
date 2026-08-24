import { describe, expect, test } from "vitest";
import { distinctMemberIds, panelMode } from "../types";
import type { ServiceAvailabilityDTO } from "../types";

describe("distinctMemberIds", () => {
  test("sorts and de-duplicates", () => {
    expect(distinctMemberIds(["m2", "m1", "m2"])).toEqual(["m1", "m2"]);
  });

  test("an empty roster gives no members", () => {
    expect(distinctMemberIds([])).toEqual([]);
  });

  test("the roster survives a week where nobody has any starts — this is what keeps 'anyone' reachable after navigating into a closed week or filtering to one person", () => {
    // The exact shape of the regression this function exists to prevent: a
    // service with two performers, in a window with zero free starts
    // anywhere (a closure, or a person with nothing that particular week).
    // A roster derived from `days` would see nothing and collapse to an
    // empty (or single-member) list, hiding the picker's own "anyone"
    // option along with it. `distinctMemberIds` never looks at `days` at
    // all — its signature only accepts the flat id list — so there is
    // nothing in this fixture's `days` for it to be misled by even if a
    // future caller passed the whole object in.
    const closedWeek: Pick<ServiceAvailabilityDTO, "memberIds" | "days"> = {
      memberIds: ["owner-1", "staff-1"],
      days: [
        { date: "2026-08-17", starts: [] },
        { date: "2026-08-18", starts: [] },
      ],
    };
    expect(distinctMemberIds(closedWeek.memberIds)).toEqual(["owner-1", "staff-1"]);
  });
});

describe("panelMode", () => {
  test("a quote service reads as quote", () => {
    expect(panelMode({ bookingMode: "quote", days: [] })).toBe("quote");
  });

  test("a priced service with an entirely empty window still reads as the grid, not quote", () => {
    expect(panelMode({ bookingMode: "priced", days: [] })).toBe("grid");
  });
});
