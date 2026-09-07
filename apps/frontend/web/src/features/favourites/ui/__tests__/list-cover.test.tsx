import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ListCover } from "../list-cover";

/**
 * The mosaic that makes a column of lists scannable when the names are
 * similar — "Casa nova" and "Casa da praia" are two words apart, and the
 * pictures are not.
 */
describe("ListCover", () => {
  it("draws a 2×2 mosaic from the list's own items", () => {
    render(<ListCover urls={["a", "b", "c", "d"]} empty={false} />);

    expect(screen.getAllByRole("presentation")).toHaveLength(4);
  });

  it("draws what it has rather than padding to four", () => {
    // Two items draw two squares. Padding with grey tiles would say the list
    // holds four things, two of which failed to load.
    render(<ListCover urls={["a", "b"]} empty={false} />);

    expect(screen.getAllByRole("presentation")).toHaveLength(2);
  });

  it("never draws more than the four the mosaic has room for", () => {
    // The read model caps `coverUrls` at four; a defensive read must not
    // spill a fifth tile out of a 2×2 grid.
    render(<ListCover urls={["a", "b", "c", "d", "e", "f"]} empty={false} />);

    expect(screen.getAllByRole("presentation")).toHaveLength(4);
  });

  it("marks an empty list as empty rather than drawing an empty box", () => {
    // A grey square beside three mosaics reads as a failed image.
    render(<ListCover urls={[]} empty />);

    expect(screen.getByTestId("cover-empty")).toBeInTheDocument();
  });

  it("distinguishes a list with items but no photographs from an empty one", () => {
    // Eight listings that all lack photos is not the same as no listings, and
    // showing the empty mark for it is a lie about the list's contents.
    render(<ListCover urls={[]} empty={false} />);

    expect(screen.queryByTestId("cover-empty")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("presentation")).toHaveLength(0);
  });

  it("says nothing to a screen reader, because the list's name already did", () => {
    // The mosaic sits inside the row's own label. An alt text per tile would
    // read four filenames out before the name of the list they belong to.
    render(<ListCover urls={["a", "b"]} empty={false} />);

    for (const tile of screen.getAllByRole("presentation")) {
      expect(tile).toHaveAttribute("alt", "");
    }
  });
});
