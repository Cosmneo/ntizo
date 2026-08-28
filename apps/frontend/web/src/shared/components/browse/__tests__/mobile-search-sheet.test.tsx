import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  MOBILE_SEARCH_FIELD_CLASS,
  MobileSearchSheet,
  MobileSearchTrigger,
} from "../mobile-search-sheet";

describe("MobileSearchTrigger", () => {
  it("shows one tappable row instead of the three-field bar", () => {
    // Two fields and a button squeezed into 360px is a control nobody
    // completes; the desktop card is hidden below `md` and this replaces it.
    render(<MobileSearchTrigger label="Search" value="Anywhere" onOpen={() => {}} />);
    expect(screen.getByRole("button", { name: /Search/ })).toBeInTheDocument();
  });

  it("announces what it draws, not a word only a screen reader hears", () => {
    // A button named "Search" that reads "Corte de cabelo · Maputo" on screen
    // is two different controls to two different readers.
    render(<MobileSearchTrigger label="Corte de cabelo" value="Maputo" onOpen={() => {}} />);
    expect(
      screen.getByRole("button", { name: /Corte de cabelo.*Maputo/ }),
    ).toBeInTheDocument();
  });

  it("is the half of the pair that only exists below md", () => {
    // The card carries `hidden md:block` and this carries `md:hidden`, so one
    // of the two is on screen at every width and never both. Kept here rather
    // than at the two call sites, which is where half of it gets forgotten.
    render(<MobileSearchTrigger label="Search" value="Anywhere" onOpen={() => {}} />);
    expect(screen.getByRole("button", { name: /Search/ }).className).toContain("md:hidden");
  });

  it("opens the sheet when it is tapped", () => {
    const onOpen = vi.fn();
    render(<MobileSearchTrigger label="Search" value="Anywhere" onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: /Search/ }));
    expect(onOpen).toHaveBeenCalledOnce();
  });
});

describe("MobileSearchSheet", () => {
  const sheet = (over: Partial<Parameters<typeof MobileSearchSheet>[0]> = {}) => (
    <MobileSearchSheet
      open
      onOpenChange={() => {}}
      title="What are you looking for?"
      apply="Show results"
      onApply={() => {}}
      {...over}
    >
      <label>
        Service
        <input type="search" className={MOBILE_SEARCH_FIELD_CLASS} />
      </label>
      <label>
        City
        <select>
          <option value="">Anywhere</option>
        </select>
      </label>
    </MobileSearchSheet>
  );

  it("opens a dialog with both fields and a way to apply them", () => {
    render(sheet());
    expect(screen.getByRole("dialog", { name: "What are you looking for?" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Service" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "City" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show results" })).toBeInTheDocument();
  });

  it("is nothing at all while it is closed", () => {
    // `SheetContent` returns null rather than hiding, so a phone that never
    // opens it never renders the fields — and a test that wants them has to
    // open it first.
    render(sheet({ open: false }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("applies the drafts on a real submit, not a click handler on the button", () => {
    // Enter in the text field reaching the button is a browser behaviour, and
    // an on-screen keyboard's "go" key is the same behaviour. Reimplementing
    // it is how the desktop card ended up needing JavaScript to search at all.
    const onApply = vi.fn();
    render(sheet({ onApply }));
    expect(screen.getByRole("button", { name: "Show results" })).toHaveAttribute(
      "type",
      "submit",
    );
    fireEvent.submit(screen.getByRole("searchbox", { name: "Service" }).closest("form")!);
    expect(onApply).toHaveBeenCalledOnce();
  });

  it("closes when the results are applied", () => {
    // A sheet left open over the results it just changed hides the answer to
    // the question the reader asked — the same rule the filter bars follow.
    const onOpenChange = vi.fn();
    render(sheet({ onOpenChange }));
    fireEvent.click(screen.getByRole("button", { name: "Show results" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not claim the search landmark the hero's own card already holds", () => {
    // Two searches in the landmark list, one of them invisible at this width,
    // is a choice nobody can make.
    render(sheet());
    expect(screen.queryByRole("search")).not.toBeInTheDocument();
  });
});
