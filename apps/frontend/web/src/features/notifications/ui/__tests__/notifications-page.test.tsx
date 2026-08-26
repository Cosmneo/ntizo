import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NotificationsPage } from "@/features/notifications/ui/notifications-page";

vi.mock("@/features/notifications/viewmodel/use-inbox", () => ({
  useInbox: () => ({
    page: {
      total: 1,
      items: [
        {
          id: "n1",
          type: "PROVIDER_VERIFIED",
          payload: {},
          createdAt: new Date().toISOString(),
          read: false,
        },
      ],
    },
    isPending: false,
    isError: false,
  }),
}));
vi.mock("@/features/notifications/viewmodel/use-mark-read", () => ({
  useMarkRead: () => ({ markOne: vi.fn(), markAll: vi.fn(), isMarkingAll: false }),
}));
// Task 10's column beside the inbox: `NotificationsPage` now calls
// `useMyActivity()` too, which reaches `useInfiniteQuery` and throws without
// a `QueryClientProvider` in the tree. Mocked empty here because these tests
// are about the inbox, not the activity column — that column gets its own
// coverage in `notifications-page-activity.test.tsx`.
vi.mock("@/features/activity/viewmodel/use-activity", () => ({
  useMyActivity: () => ({
    entries: [],
    loading: false,
    hasMore: false,
    loadMore: vi.fn(),
  }),
}));

describe("NotificationsPage", () => {
  it("draws the sentence for a known type", () => {
    render(<NotificationsPage scope={{ kind: "mine" }} />);
    expect(screen.getByText(/verified/i)).toBeInTheDocument();
  });

  it("groups under a day heading", () => {
    render(<NotificationsPage scope={{ kind: "mine" }} />);
    expect(screen.getByRole("heading", { name: /today/i })).toBeInTheDocument();
  });

  it("says nothing about how many are shown when every item already is", () => {
    // total (1) equals items.length (1) here — a caption in that case would
    // be a sentence with nothing to say.
    render(<NotificationsPage scope={{ kind: "mine" }} />);
    expect(screen.queryByText(/showing/i)).not.toBeInTheDocument();
  });
});
