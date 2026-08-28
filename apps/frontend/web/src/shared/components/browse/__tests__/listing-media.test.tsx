import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ListingMedia } from "../listing-media";

describe("ListingMedia", () => {
  it("shows the photograph when there is one", () => {
    const { container } = render(
      <ListingMedia imageUrl="https://cdn/x.jpg" seed="hair" name="Estúdio Mavalane" icon="Scissors" />,
    );
    expect(container.querySelector("img")).toHaveAttribute("src", "https://cdn/x.jpg");
  });

  it("gives the image an empty alt, because the name is already beside it", () => {
    // Alt text repeating the heading is read twice by a screen reader and says
    // nothing new either time.
    const { container } = render(
      <ListingMedia imageUrl="https://cdn/x.jpg" seed="hair" name="Estúdio" icon="Scissors" />,
    );
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
  });

  it("draws a generated tile rather than a broken image when there is none", () => {
    // Most listings have no photograph. A column of empty grey rectangles
    // reads as a broken page; a column of different tiles reads as a
    // catalogue.
    const { container } = render(
      <ListingMedia imageUrl={null} seed="hair" name="Estúdio Mavalane" icon="Scissors" />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("EM")).toBeInTheDocument();
  });

  it("gives the same trade the same tile on both pages", () => {
    const a = render(
      <ListingMedia imageUrl={null} seed="plumbing" name="Canalizações Beira" icon="Wrench" />,
    );
    const first = a.container
      .querySelector("[data-testid='listing-placeholder']")!
      .getAttribute("style");
    a.unmount();
    const b = render(
      <ListingMedia imageUrl={null} seed="plumbing" name="Outra Empresa" icon="Wrench" />,
    );
    const second = b.container
      .querySelector("[data-testid='listing-placeholder']")!
      .getAttribute("style");
    expect(first).toBe(second);
  });

  it("still renders a tile for a category whose icon is unknown to this build", () => {
    // The icon name comes from a table an administrator edits, so the code
    // cannot know the set at build time. A hole in the grid reads as a bug.
    const { container } = render(
      <ListingMedia imageUrl={null} seed="hair" name="Estúdio" icon="NotARealLucideIcon" />,
    );
    expect(container.querySelector("[data-testid='listing-placeholder']")).not.toBeNull();
  });

  it("still renders a tile for a category with no icon at all", () => {
    const { container } = render(
      <ListingMedia imageUrl={null} seed="hair" name="Estúdio" icon={null} />,
    );
    expect(container.querySelector("[data-testid='listing-placeholder']")).not.toBeNull();
  });

  it("leaves no marker in the corners when nothing was passed for them", () => {
    // This plan ships with no favourite button; the slot must not reserve
    // visible space for one.
    const { container } = render(
      <ListingMedia imageUrl={null} seed="hair" name="Estúdio" icon="Scissors" />,
    );
    expect(container.querySelector("[data-testid='listing-badge']")).toBeNull();
    expect(container.querySelector("[data-testid='listing-favourite']")).toBeNull();
  });

  it("falls back to the generated tile when the photograph 404s", () => {
    // A broken-image glyph is worse than the grey rectangle this component
    // exists to avoid, and it can happen for reasons nobody controls: a
    // deleted object, a moved bucket, an expired signed URL.
    const { container } = render(
      <ListingMedia imageUrl="https://cdn/dead.jpg" seed="hair" name="Estúdio Mavalane" icon="Scissors" />,
    );
    const img = container.querySelector("img")!;
    fireEvent.error(img);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("EM")).toBeInTheDocument();
  });

  it("keeps the photograph on screen when it loads fine", () => {
    // The failure path must not fire for a healthy image — no `onError` means
    // no reason to swap anything.
    const { container } = render(
      <ListingMedia imageUrl="https://cdn/x.jpg" seed="hair" name="Estúdio Mavalane" icon="Scissors" />,
    );
    expect(container.querySelector("img")).not.toBeNull();
    expect(container.querySelector("[data-testid='listing-placeholder']")).toBeNull();
  });

  it("gives a new imageUrl a fresh chance after an earlier one failed", () => {
    // The same card, scrolled out and back in with a different photograph,
    // must not stay stuck on the tile a previous, unrelated URL earned.
    const { container, rerender } = render(
      <ListingMedia imageUrl="https://cdn/dead.jpg" seed="hair" name="Estúdio Mavalane" icon="Scissors" />,
    );
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();

    rerender(
      <ListingMedia imageUrl="https://cdn/fresh.jpg" seed="hair" name="Estúdio Mavalane" icon="Scissors" />,
    );
    expect(container.querySelector("img")).toHaveAttribute("src", "https://cdn/fresh.jpg");
    expect(container.querySelector("[data-testid='listing-placeholder']")).toBeNull();
  });

  it("puts the badge top-left and the favourite top-right", () => {
    // Badges left, save right — the convention every listing product shares,
    // and getting it backwards makes both feel misplaced.
    const { container } = render(
      <ListingMedia
        imageUrl={null}
        seed="hair"
        name="Estúdio"
        icon="Scissors"
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
