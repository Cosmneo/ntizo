import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PreferencesPage } from "@/features/account/ui/section-pages";

vi.mock("@/features/user/viewmodel/use-current-user", () => ({
  useCurrentUser: () => ({
    data: { id: "u1", email: "amelia@example.com", language: "en-US" },
  }),
}));
vi.mock("@/features/account/viewmodel/use-update-profile", () => ({
  useUpdateMyProfile: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

describe("PreferencesPage", () => {
  it("offers the language and the appearance", () => {
    render(<PreferencesPage />);
    expect(screen.getByRole("heading", { name: /language/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /appearance/i })).toBeInTheDocument();
  });

  it("has no notification switches — every notification goes by email, and there is nothing to choose", () => {
    // Four rows of disabled checkboxes with a note saying they were not
    // saved used to sit here. A settings page that is mostly inert controls
    // reads as broken.
    render(<PreferencesPage />);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryByText(/these switches/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /notifications/i })).not.toBeInTheDocument();
  });

  it("says the current language once, in the control, not again beside the heading", () => {
    render(<PreferencesPage />);
    expect(screen.getAllByText("English")).toHaveLength(1);
  });
});
