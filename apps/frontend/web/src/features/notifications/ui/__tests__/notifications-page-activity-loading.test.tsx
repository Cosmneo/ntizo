import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { NotificationsPage } from "@/features/notifications/ui/notifications-page";

// Separate file for the same reason as `notifications-page-activity.test.tsx`:
// this file's `useMyActivity` mock (loading, no entries) cannot coexist with
// either sibling file's mock in one module.
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
vi.mock("@/features/activity/viewmodel/use-activity", () => ({
  useMyActivity: () => ({
    entries: [],
    loading: true,
    hasMore: false,
    loadMore: vi.fn(),
  }),
}));

/**
 * Task 10's brief names `skeletonRows={4}` explicitly. The inbox is mocked
 * empty (and so renders no `<li>` of its own — `EmptyCard` has none) so every
 * `<li>` in the tree is `ActivityList`'s own skeleton row, making the count a
 * direct check on the prop actually reaching `ActivityList`: passing the
 * component's own default (5) instead, or omitting the prop, would leave this
 * red at 5, not 4.
 */
describe("NotificationsPage (activity column, loading)", () => {
  it("draws exactly four placeholder rows while activity loads", () => {
    const { container } = render(<NotificationsPage scope={{ kind: "mine" }} />);
    expect(container.querySelectorAll("li")).toHaveLength(4);
  });
});
