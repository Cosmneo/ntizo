import { describe, expect, it } from "vitest";
import { moved } from "../types";

const rows = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
const ids = (list: readonly { id: string }[]) => list.map((r) => r.id);

/**
 * The one piece of the reordering that is worth testing on its own: both the
 * drag and the two menu items go through it, so an off-by-one here is an
 * off-by-one everywhere.
 */
describe("moved", () => {
  it("moves a row up one place", () => {
    expect(ids(moved(rows, "c", -1))).toEqual(["a", "c", "b", "d"]);
  });

  it("moves a row down one place", () => {
    expect(ids(moved(rows, "b", 1))).toEqual(["a", "c", "b", "d"]);
  });

  it("leaves the first row alone when moved up", () => {
    // Clamped, not wrapped. A row jumping from the top to the bottom is the
    // opposite of what somebody pressing "up" once meant.
    expect(ids(moved(rows, "a", -1))).toEqual(["a", "b", "c", "d"]);
  });

  it("leaves the last row alone when moved down", () => {
    expect(ids(moved(rows, "d", 1))).toEqual(["a", "b", "c", "d"]);
  });

  it("returns a copy, never the same array", () => {
    // The caller renders from this optimistically; handing back the original
    // would mutate the query cache's own array under React.
    const same = moved(rows, "a", -1);
    expect(same).not.toBe(rows);
    expect(ids(rows)).toEqual(["a", "b", "c", "d"]);
  });

  it("ignores an id that is not in the list", () => {
    expect(ids(moved(rows, "ghost", 1))).toEqual(["a", "b", "c", "d"]);
  });

  it("keeps every row, whatever the move", () => {
    for (const id of ids(rows)) {
      for (const delta of [-2, -1, 1, 2]) {
        expect(ids(moved(rows, id, delta)).sort()).toEqual(["a", "b", "c", "d"]);
      }
    }
  });
});
