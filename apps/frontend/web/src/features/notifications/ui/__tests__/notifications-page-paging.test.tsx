import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotificationsPage } from "@/features/notifications/ui/notifications-page";

// A separate file rather than a second `describe` in a sibling test: `vi.mock`
// is hoisted to the top of its own module, so two different mocks of the same
// viewmodel cannot coexist in one file — see the same note on
// `notifications-page-empty.test.tsx`.
const fakes = vi.hoisted(() => ({ loadMore: vi.fn() }));

vi.mock("@/features/notifications/viewmodel/use-inbox", () => ({
  useInbox: () => ({
    page: {
      // 25 in the inbox, 20 on the page: one full page and a remainder.
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
    hasMore: true,
    isLoadingMore: false,
    loadMore: fakes.loadMore,
  }),
}));
vi.mock("@/features/notifications/viewmodel/use-mark-read", () => ({
  useMarkRead: () => ({ markOne: vi.fn(), markAll: vi.fn(), isMarkingAll: false }),
}));

/**
 * The end of the list, and what reaching it does.
 *
 * `src/test/setup.ts` installs an inert `IntersectionObserver` for the whole
 * suite — it reports nothing as visible, which is the right default for an
 * environment with no viewport. This file replaces it with one that hands
 * back the callback so a test can say "the reader scrolled to the bottom"
 * explicitly. jsdom does no layout, so there is no scrolling to simulate and
 * no honest way to trigger a real observer; firing the callback the component
 * actually registered is the closest a unit test gets, and it still proves
 * the wiring — that the sentinel is observed, and that a visible entry calls
 * `loadMore`.
 */
type Fire = () => void;
let fires: Fire[] = [];
const realObserver = globalThis.IntersectionObserver;

beforeEach(() => {
  fakes.loadMore.mockReset();
  fires = [];
  globalThis.IntersectionObserver = class {
    root = null;
    rootMargin = "";
    thresholds: readonly number[] = [];
    constructor(private readonly callback: IntersectionObserverCallback) {}
    observe(target: Element) {
      fires.push(() =>
        this.callback(
          [{ isIntersecting: true, target } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        ),
      );
    }
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
});

afterEach(() => {
  globalThis.IntersectionObserver = realObserver;
});

describe("NotificationsPage (more rows than the page shows)", () => {
  it("says how many of how many", () => {
    render(<NotificationsPage scope={{ kind: "mine" }} />);
    expect(screen.getByText("Showing 20 of 25.")).toBeInTheDocument();
  });

  it("fetches the next page when the end of the list scrolls into view", () => {
    render(<NotificationsPage scope={{ kind: "mine" }} />);

    // The observer exists and is watching something — without this line a
    // component that registered nothing would still pass the assertion below
    // by never firing and never being asked to.
    expect(fires).toHaveLength(1);
    expect(fakes.loadMore).not.toHaveBeenCalled();

    fires[0]!();

    expect(fakes.loadMore).toHaveBeenCalledTimes(1);
  });

  it("also fetches it from the button, for a reader who never scrolls with a mouse", async () => {
    // The observer is the whole feature for most people and useless to some:
    // a keyboard tabs to the end of the list, a screen reader is read the
    // control rather than shown it, and a background tab fires no observer at
    // all. The button is the same element the observer watches, so this is not
    // a second mechanism — it is the one that works when the first cannot.
    const user = userEvent.setup();
    render(<NotificationsPage scope={{ kind: "mine" }} />);

    await user.click(screen.getByRole("button", { name: /load more/i }));

    expect(fakes.loadMore).toHaveBeenCalledTimes(1);
  });
});
