import { describe, expect, test } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Avatar, AvatarFallback, AvatarImage } from "../avatar";

// This primitive is hand-rolled, not Radix: `AvatarFallback` is a plain flex
// sibling of the `<img>`, not a peer a shared loading-state machine picks
// between. Without `AvatarImage` unmounting itself on `error`, a broken photo
// leaves both elements mounted and the fallback clipped outside the circle —
// these tests exist to catch exactly that regression, not to describe Radix.
describe("AvatarImage", () => {
  test("a good src renders the image", () => {
    render(
      <Avatar>
        <AvatarImage src="https://example.test/photo.jpg" alt="Ana" />
        <AvatarFallback>AN</AvatarFallback>
      </Avatar>,
    );
    expect(screen.getByRole("img", { name: "Ana" })).toBeInTheDocument();
  });

  test("firing error on the image removes it, leaving only the fallback", () => {
    render(
      <Avatar>
        <AvatarImage src="https://example.test/broken.jpg" alt="Ana" />
        <AvatarFallback>AN</AvatarFallback>
      </Avatar>,
    );
    fireEvent.error(screen.getByRole("img", { name: "Ana" }));

    // If `onError` were removed, the <img> stays mounted and this fails.
    expect(screen.queryByRole("img", { name: "Ana" })).not.toBeInTheDocument();
    expect(screen.getByText("AN")).toBeInTheDocument();
  });

  test("a src change after an error shows an image again", () => {
    const { rerender } = render(
      <Avatar>
        <AvatarImage src="https://example.test/broken.jpg" alt="Ana" />
        <AvatarFallback>AN</AvatarFallback>
      </Avatar>,
    );
    fireEvent.error(screen.getByRole("img", { name: "Ana" }));
    expect(screen.queryByRole("img", { name: "Ana" })).not.toBeInTheDocument();

    rerender(
      <Avatar>
        <AvatarImage src="https://example.test/good.jpg" alt="Ana" />
        <AvatarFallback>AN</AvatarFallback>
      </Avatar>,
    );

    // If the failed flag weren't reset on a new `src`, this stays absent
    // even though the new photo was never given a chance to fail.
    expect(screen.getByRole("img", { name: "Ana" })).toBeInTheDocument();
  });
});
