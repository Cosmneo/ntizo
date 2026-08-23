import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NotificationsPage } from "@/features/notifications/ui/notifications-page";

// A separate file rather than a second `describe` in the sibling test:
// `vi.mock` is hoisted to the top of its own module, so two different mocks
// of the same viewmodel cannot coexist in one file.
vi.mock("@/features/notifications/viewmodel/use-inbox", () => ({
  useInbox: () => ({
    page: { total: 0, items: [] },
    isPending: false,
    isError: false,
  }),
}));
vi.mock("@/features/notifications/viewmodel/use-mark-read", () => ({
  useMarkRead: () => ({ markOne: vi.fn(), markAll: vi.fn(), isMarkingAll: false }),
}));

describe("NotificationsPage (empty inbox)", () => {
  it("renders the empty state", () => {
    render(<NotificationsPage scope={{ kind: "mine" }} />);
    expect(screen.getByText(/nothing yet/i)).toBeInTheDocument();
  });

  it("renders no mark-all-as-read button", () => {
    // An action over a list it cannot change is a button that lies: there is
    // nothing unread in an empty inbox, so the control must not appear.
    render(<NotificationsPage scope={{ kind: "mine" }} />);
    expect(screen.queryByRole("button", { name: /mark all/i })).not.toBeInTheDocument();
  });
});
