import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NotificationsPage } from "@/features/notifications/ui/notifications-page";

// A separate file for the same reason as its siblings: one mock of the
// viewmodel per module.
vi.mock("@/features/notifications/viewmodel/use-inbox", () => ({
  useInbox: () => ({
    page: { total: 0, items: [] },
    isPending: true,
    isError: false,
    hasMore: false,
    isLoadingMore: false,
    loadMore: vi.fn(),
  }),
}));
vi.mock("@/features/notifications/viewmodel/use-unread-count", () => ({
  useUnreadCount: () => 0,
}));
vi.mock("@/features/notifications/viewmodel/use-mark-read", () => ({
  useMarkRead: () => ({ markOne: vi.fn(), markAll: vi.fn(), isMarkingAll: false }),
}));

describe("NotificationsPage (first page still loading)", () => {
  it("holds the list's place rather than rendering nothing", () => {
    // The page used to render an empty column until the first page landed,
    // then jump. A placeholder that announces itself is what stands there now.
    render(<NotificationsPage scope={{ kind: "mine" }} zone={{ kind: "customer" }} />);
    expect(screen.getByRole("status", { name: /loading notifications/i })).toBeInTheDocument();
  });

  it("does not claim the inbox is empty while it has not been read yet", () => {
    render(<NotificationsPage scope={{ kind: "mine" }} zone={{ kind: "customer" }} />);
    expect(screen.queryByText(/nothing yet/i)).not.toBeInTheDocument();
  });
});
