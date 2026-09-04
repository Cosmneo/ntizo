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
    hasMore: false,
    isLoadingMore: false,
    loadMore: vi.fn(),
  }),
}));
vi.mock("@/features/notifications/viewmodel/use-mark-read", () => ({
  useMarkRead: () => ({ markOne: vi.fn(), markAll: vi.fn(), isMarkingAll: false }),
}));
// No `use-activity` mock. There was one, because the page called
// `useMyActivity()` for a column beside the inbox and that hook reaches
// `useInfiniteQuery`, which throws without a `QueryClientProvider`. The column
// is gone, so the mock would be scaffolding for a call that no longer happens
// — and its absence is load-bearing: putting the column back without a
// provider in the tree turns this whole file red rather than passing quietly.

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

  it("shows notifications and nothing else — no activity feed beside them", () => {
    // A 320px "Recent activity" column sat here in both zones, duplicating
    // `/activity`, `/provider/$slug/activity` and `/admin/activity`. Asserting
    // on the copy the column rendered (`account:activityListTitle`, "Recent
    // activity") rather than on a class name or a child count, so this stays
    // red for any re-introduction, however it is laid out.
    render(<NotificationsPage scope={{ kind: "mine" }} />);
    expect(screen.queryByText(/recent activity/i)).not.toBeInTheDocument();
  });
});
