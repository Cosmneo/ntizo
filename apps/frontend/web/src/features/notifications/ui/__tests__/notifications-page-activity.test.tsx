import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NotificationsPage } from "@/features/notifications/ui/notifications-page";

// A separate file rather than a second describe alongside the other
// `NotificationsPage` tests: `vi.mock` is hoisted to the top of its own
// module, so this file's `useMyActivity` mock (real entries) cannot coexist
// with the empty-entries mock the sibling files use — same reasoning as
// `notifications-page-empty.test.tsx`'s note on `use-inbox`.
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

const OLDER = {
  id: "a1",
  type: "user.registered",
  payload: {},
  occurredAt: "2026-08-10T09:00:00Z",
};
const NEWER = {
  id: "a2",
  type: "service.published",
  payload: { serviceName: "Haircut" },
  occurredAt: "2026-08-22T09:00:00Z",
};

vi.mock("@/features/activity/viewmodel/use-activity", () => ({
  useMyActivity: () => ({
    entries: [OLDER, NEWER],
    loading: false,
    hasMore: false,
    loadMore: vi.fn(),
  }),
}));

/**
 * Task 10: the activity column beside the inbox.
 *
 * The inbox is mocked empty here on purpose — these assertions are about
 * `ActivityList` receiving `useMyActivity()`'s rows unmodified, not about the
 * inbox, which the sibling files already cover.
 *
 * Two entries with distinct types (so distinct rendered sentences) and
 * distinct timestamps, asserted in the exact order the hook returned them:
 * a single-entry fixture would stay green even if `NotificationsPage`
 * silently reversed or dropped the list before handing it to `ActivityList`.
 */
describe("NotificationsPage (activity column)", () => {
  it("renders the caller's activity, in the order useMyActivity returned it", () => {
    const { container } = render(<NotificationsPage scope={{ kind: "mine" }} />);

    const rows = Array.from(container.querySelectorAll("li"));
    const texts = rows.map((row) => row.textContent ?? "");

    expect(texts.some((text) => text.includes("Created your account"))).toBe(true);
    expect(texts.some((text) => text.includes("Published Haircut"))).toBe(true);

    const olderIndex = texts.findIndex((text) => text.includes("Created your account"));
    const newerIndex = texts.findIndex((text) => text.includes("Published Haircut"));
    expect(olderIndex).toBeGreaterThanOrEqual(0);
    expect(newerIndex).toBeGreaterThan(olderIndex);
  });

  /**
   * Nothing about the grid's markup enforces which cell comes first — below
   * `lg` the grid falls back to its one implicit column and stacks children
   * in DOM order, so this is the one thing standing between "the activity
   * column lands under the inbox" (the brief's Step 2) and a later refactor
   * (e.g. extracting a shared wrapper around both cells) silently swapping
   * that order. Every other test in this file and its siblings passes
   * whichever cell renders first, since none of them looks at relative
   * position — this is deliberately the one that does.
   */
  it("keeps the inbox before the activity column in the DOM", () => {
    render(<NotificationsPage scope={{ kind: "mine" }} />);

    const inboxHeading = screen.getByRole("heading", { name: /notifications/i });
    const activityTitle = screen.getByText(/recent activity/i);

    expect(
      inboxHeading.compareDocumentPosition(activityTitle) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
