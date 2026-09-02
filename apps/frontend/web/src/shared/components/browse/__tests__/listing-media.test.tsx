import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { ListingMedia } from "../listing-media";

describe("ListingMedia", () => {
  it("shows the photograph when there is one", () => {
    const { container } = render(<ListingMedia imageUrl="https://cdn/x.jpg" />);
    expect(container.querySelector("img")).toHaveAttribute("src", "https://cdn/x.jpg");
  });

  it("gives the image an empty alt, because the name is already beside it", () => {
    // Alt text repeating the heading is read twice by a screen reader and says
    // nothing new either time.
    const { container } = render(<ListingMedia imageUrl="https://cdn/x.jpg" />);
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
  });

  it("draws the brand mark rather than a broken image when there is none", () => {
    // Most listings have no photograph, so this is the common case rather than
    // the exception. It used to be a per-trade gradient tile carrying the
    // business's initials; it is now the same mark every other missing picture
    // in the product shows.
    const { container } = render(<ListingMedia imageUrl={null} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[data-testid='media-fallback']")).not.toBeNull();
  });

  it("leaves no marker in the corners when nothing was passed for them", () => {
    // This plan ships with no favourite button; the slot must not reserve
    // visible space for one.
    const { container } = render(<ListingMedia imageUrl={null} />);
    expect(container.querySelector("[data-testid='listing-badge']")).toBeNull();
    expect(container.querySelector("[data-testid='listing-favourite']")).toBeNull();
  });

  it("falls back to the mark when the photograph 404s", () => {
    // A broken-image glyph is the worst of the three outcomes, and it happens
    // for reasons nobody controls: a deleted object, a moved bucket, an
    // expired signed URL. Every seeded provider photo on dev is one today.
    const { container } = render(<ListingMedia imageUrl="https://cdn/dead.jpg" />);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[data-testid='media-fallback']")).not.toBeNull();
  });

  it("keeps the photograph on screen when it loads fine", () => {
    // The failure path must not fire for a healthy image — no `onError` means
    // no reason to swap anything.
    const { container } = render(<ListingMedia imageUrl="https://cdn/x.jpg" />);
    expect(container.querySelector("img")).not.toBeNull();
    expect(container.querySelector("[data-testid='media-fallback']")).toBeNull();
  });

  it("gives a new imageUrl a fresh chance after an earlier one failed", () => {
    // The same card, scrolled out and back in with a different photograph,
    // must not stay stuck on the fallback a previous, unrelated URL earned.
    // This is why the failure is remembered as a URL and not as a boolean.
    const { container, rerender } = render(<ListingMedia imageUrl="https://cdn/dead.jpg" />);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();

    rerender(<ListingMedia imageUrl="https://cdn/fresh.jpg" />);
    expect(container.querySelector("img")).toHaveAttribute("src", "https://cdn/fresh.jpg");
    expect(container.querySelector("[data-testid='media-fallback']")).toBeNull();
  });

  it("puts the badge top-left and the favourite top-right", () => {
    // Badges left, save right — the convention every listing product shares,
    // and getting it backwards makes both feel misplaced.
    const { container } = render(
      <ListingMedia
        imageUrl={null}
        badge={<span>Most booked</span>}
        favourite={<button type="button">Save</button>}
      />,
    );
    expect(container.querySelector("[data-testid='listing-badge']")?.className).toContain("left-");
    expect(container.querySelector("[data-testid='listing-favourite']")?.className).toContain(
      "right-",
    );
  });
});
