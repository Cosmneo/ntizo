import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NotificationsPage } from "@/features/notifications/ui/notifications-page";

// A separate file rather than a second `describe` in a sibling test: `vi.mock`
// is hoisted to the top of its own module, so two different mocks of the same
// viewmodel cannot coexist in one file — see the same note on
// `notifications-page-empty.test.tsx`.
vi.mock("@/features/notifications/viewmodel/use-inbox", () => ({
  useInbox: () => ({
    page: {
      // 25 in a workspace, 20 on the page: exactly the case the finding named.
      total: 25,
      items: Array.from({ length: 20 }, (_, i) => ({
        id: `n${i}`,
        type: "PROVIDER_VERIFIED",
        payload: {},
        createdAt: new Date().toISOString(),
        read: false,
      })),
    },
    isPending: false,
    isError: false,
  }),
}));
vi.mock("@/features/notifications/viewmodel/use-mark-read", () => ({
  useMarkRead: () => ({ markOne: vi.fn(), markAll: vi.fn(), isMarkingAll: false }),
}));
// See the same mock in `notifications-page.test.tsx`: `useMyActivity()`
// throws without a `QueryClientProvider` unless stubbed.
vi.mock("@/features/activity/viewmodel/use-activity", () => ({
  useMyActivity: () => ({
    entries: [],
    loading: false,
    hasMore: false,
    loadMore: vi.fn(),
  }),
}));

describe("NotificationsPage (more rows than the page shows)", () => {
  it("says how many of how many, rather than offering a load-more control that does nothing", () => {
    render(<NotificationsPage scope={{ kind: "mine" }} />);
    expect(screen.getByText("Showing 20 of 25.")).toBeInTheDocument();
    // No load-more: this page carries no offset control (see
    // notifications-page.tsx's comment on why), so a button here would be
    // one that lies.
    expect(
      screen.queryByRole("button", { name: /load more/i }),
    ).not.toBeInTheDocument();
  });
});
