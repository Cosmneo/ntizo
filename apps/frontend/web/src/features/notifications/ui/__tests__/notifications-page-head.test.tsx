import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NotificationsPage } from "@/features/notifications/ui/notifications-page";

// A separate file rather than a second `describe` in the sibling test:
// `vi.mock` is hoisted to the top of its own module, so two different mocks
// of the same viewmodel cannot coexist in one file.
//
// The shape here is the one the head has to get right: the twenty rows on
// screen are all read, but the inbox holds twenty-seven and three of the
// older ones are not. What the reader can see says "nothing to do"; the
// count says otherwise, and the count is the truth.
vi.mock("@/features/notifications/viewmodel/use-inbox", () => ({
  useInbox: () => ({
    page: {
      total: 27,
      items: Array.from({ length: 20 }, (_, i) => ({
        id: `n${i}`,
        type: "PROVIDER_VERIFIED",
        payload: {},
        createdAt: new Date().toISOString(),
        read: true,
      })),
    },
    isPending: false,
    isError: false,
    hasMore: true,
    isLoadingMore: false,
    loadMore: vi.fn(),
  }),
}));
vi.mock("@/features/notifications/viewmodel/use-unread-count", () => ({
  useUnreadCount: () => 3,
}));
vi.mock("@/features/notifications/viewmodel/use-mark-read", () => ({
  useMarkRead: () => ({ markOne: vi.fn(), markAll: vi.fn(), isMarkingAll: false }),
}));

describe("NotificationsPage (head)", () => {
  it("says how many are unread, out of how many there are", () => {
    render(<NotificationsPage scope={{ kind: "mine" }} zone={{ kind: "customer" }} />);
    expect(screen.getByText(/3 unread of 27/i)).toBeInTheDocument();
  });

  it("offers to mark all read when the unread rows are ones the reader cannot see", () => {
    // The button used to be driven by the rows on screen, so three unread
    // rows on page two lit the badge with no way to clear them.
    render(<NotificationsPage scope={{ kind: "mine" }} zone={{ kind: "customer" }} />);
    expect(screen.getByRole("button", { name: /mark all as read/i })).toBeInTheDocument();
  });
});
