import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";

/**
 * The viewmodel hooks are the seam, not the query cache — see the same note
 * on `user-menu.test.tsx`. `HeaderActions` renders `UserMenu` too once
 * signed in, so its dependencies need mocking here as well or the render
 * throws reaching into a query client that does not exist in this test.
 */
vi.mock("@/features/user/viewmodel/use-current-user", () => ({
  useCurrentUser: () => ({
    data: {
      id: "u1",
      email: "cust@ntizo.test",
      name: "Carla Cliente",
      role: "customer",
    },
  }),
  useClearSessionQueryCache: () => () => {},
}));
vi.mock("@/features/provider/viewmodel/use-providers", () => ({
  useMyProviders: () => ({ data: [] }),
}));
vi.mock("@/features/user/viewmodel/use-sign-out", () => ({
  useSignOut: () => async () => ({ serverRevokeFailed: false }),
}));
vi.mock("@/features/notifications/viewmodel/use-unread-count", () => ({
  useUnreadCount: () => 5,
}));

const { HeaderActions } = await import("./header-actions");

async function renderHeader() {
  const root = createRootRoute({ component: () => <HeaderActions /> });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
}

describe("HeaderActions", () => {
  it("announces the unread count in the bell link's accessible name", async () => {
    // The badge's own aria-label loses to the wrapping link's for the
    // link's accessible name — an element's own aria-label wins over its
    // descendants'. A screen-reader user tabbing to the bell hears the
    // link's name, so the count has to live there, not just on the badge.
    await renderHeader();
    expect(
      screen.getByRole("link", { name: /5 unread notifications/i }),
    ).toBeInTheDocument();
  });
});
