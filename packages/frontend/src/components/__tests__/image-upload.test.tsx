import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { LogoUpload } from "../image-upload";

const CROP_STRINGS = {
  title: "Crop",
  hint: "Frame the image",
  cancel: "Cancel",
  confirm: "Confirm",
  zoom: "Zoom",
};

describe("LogoUpload shape prop", () => {
  test("shape='round' puts rounded-full on the preview button", () => {
    render(
      <LogoUpload
        onSelect={() => {}}
        cropStrings={CROP_STRINGS}
        label="Logo"
        hint="Upload a logo"
        chooseText="Choose"
        replaceText="Replace"
        removeText="Remove"
        shape="round"
      />,
    );
    const button = screen.getByRole("button", { name: "Logo" });
    expect(button).toHaveClass("rounded-full");
    expect(button).not.toHaveClass("rounded-[var(--radius-card-sm)]");
  });

  test("omitting shape defaults to square radius", () => {
    render(
      <LogoUpload
        onSelect={() => {}}
        cropStrings={CROP_STRINGS}
        label="Logo"
        hint="Upload a logo"
        chooseText="Choose"
        replaceText="Replace"
        removeText="Remove"
      />,
    );
    const button = screen.getByRole("button", { name: "Logo" });
    expect(button).toHaveClass("rounded-[var(--radius-card-sm)]");
    expect(button).not.toHaveClass("rounded-full");
  });
});
