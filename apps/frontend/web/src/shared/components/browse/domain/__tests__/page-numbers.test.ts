import { describe, expect, it } from "vitest";
import { pageNumbers, type PageSlot } from "../page-numbers";

/** Just the labels, for readability. */
const shape = (total: number, size: number, offset: number) =>
  pageNumbers(total, size, offset).map((s) => (s === "gap" ? "…" : String(s.page)));

/** The slot marked current, if any. */
const currentSlot = (slots: PageSlot[]) =>
  slots.find((s): s is Exclude<PageSlot, "gap"> => s !== "gap" && s.current);

describe("pageNumbers", () => {
  it("renders nothing when everything fits on one page", () => {
    // A pager offering page 1 of 1 is a control with no outcome, and drawing
    // it makes an eight-result search look truncated.
    expect(pageNumbers(8, 24, 0)).toEqual([]);
  });

  it("renders nothing when there are no results at all", () => {
    expect(pageNumbers(0, 24, 0)).toEqual([]);
  });

  it("lists every page while they fit", () => {
    expect(shape(100, 24, 0)).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("marks exactly one page as current", () => {
    const slots = pageNumbers(100, 24, 48);
    expect(slots.filter((s) => s !== "gap" && s.current)).toHaveLength(1);
    expect(currentSlot(slots)).toMatchObject({ page: 3, offset: 48 });
  });

  it("elides the middle on a long list, keeping the ends and the neighbours", () => {
    // Page 10 of 20: first, gap, 9, 10, 11, gap, last.
    expect(shape(480, 24, 216)).toEqual(["1", "…", "9", "10", "11", "…", "20"]);
  });

  it("does not draw a gap that hides a single page", () => {
    // A "…" standing in for page 2 alone is longer than page 2, and the reader
    // loses a destination to gain nothing.
    expect(shape(480, 24, 72)).toEqual(["1", "2", "3", "4", "5", "…", "20"]);
  });

  it("counts a total that is an exact multiple of the page size correctly", () => {
    // 96 / 24 = 4 exactly. An off-by-one here invents an empty fifth page.
    expect(shape(96, 24, 0)).toEqual(["1", "2", "3", "4"]);
  });

  it("counts one item past a full page as a second page", () => {
    expect(shape(25, 24, 0)).toEqual(["1", "2"]);
  });

  it("clamps an offset past the end onto the last page", () => {
    // `?offset=99999` is a URL somebody can type. It must not leave every page
    // unmarked.
    expect(currentSlot(pageNumbers(96, 24, 99_999))).toMatchObject({ page: 4 });
  });

  it("treats a negative offset as the first page", () => {
    expect(currentSlot(pageNumbers(96, 24, -40))).toMatchObject({ page: 1 });
  });

  it("gives every slot the offset that reaches it", () => {
    const slots = pageNumbers(96, 24, 0).filter((s): s is Exclude<PageSlot, "gap"> => s !== "gap");
    expect(slots.map((s) => s.offset)).toEqual([0, 24, 48, 72]);
  });
});
