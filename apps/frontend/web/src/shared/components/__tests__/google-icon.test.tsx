import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { GoogleIcon } from "../icons";

describe("GoogleIcon", () => {
  it("draws the mark in Google's four brand colours", () => {
    // It shipped as one path filled #EA4335 — the whole glyph in red, which
    // renders as a smudge and is not a mark Google permits. Asserting the set
    // of fills is what tells a four-colour logo from a one-colour one; counting
    // paths would not, since the broken version could have had four red ones.
    const { container } = render(<GoogleIcon />);
    const fills = [...container.querySelectorAll("path")].map((p) =>
      p.getAttribute("fill")?.toUpperCase(),
    );
    expect(new Set(fills)).toEqual(
      new Set(["#4285F4", "#34A853", "#FBBC05", "#EA4335"]),
    );
  });

  it("is hidden from screen readers, because the button already says Google", () => {
    const { container } = render(<GoogleIcon />);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});
