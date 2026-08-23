import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";

/**
 * The one place both bells' shared composition is pinned. Before this
 * extraction, `header-actions.test.tsx` pinned the customer header's copy and
 * `provider-shell.tsx` had no test at all — and because `ProviderShell`
 * renders `<HeaderActions showAccount={false} />`, its copy was the *only*
 * bell a provider-zone user ever saw. Testing the shared component once
 * closes that gap for both call sites at once, rather than needing a second,
 * heavier harness to render the whole shell.
 */
vi.mock("@/features/notifications/viewmodel/use-unread-count", () => ({
  useUnreadCount: () => 7,
}));

const { NotificationBellLink } = await import("./notification-bell-link");

async function renderLink(props: {
  scope: { kind: "mine" } | { kind: "provider"; providerId: string };
  to: string;
  params?: Record<string, string>;
  className?: string;
}) {
  const root = createRootRoute({ component: () => <NotificationBellLink {...props} /> });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
}

describe("NotificationBellLink", () => {
  it("announces the unread count in its own accessible name, not just the badge's", async () => {
    // The badge's own aria-label loses to the wrapping link's for the link's
    // accessible name — an element's own aria-label wins over its
    // descendants'. A screen reader tabbing to the bell has to hear the
    // count from the link itself.
    await renderLink({ scope: { kind: "mine" }, to: "/account/notifications" });
    expect(
      screen.getByRole("link", { name: /7 unread notifications/i }),
    ).toBeInTheDocument();
  });

  it("carries the caller's own className, unchanged — the provider shell's 36px square is not this component's to redesign", async () => {
    await renderLink({
      scope: { kind: "provider", providerId: "p1" },
      to: "/provider/$slug/notifications",
      params: { slug: "acme" },
      className: "relative hidden h-9 w-9 items-center justify-center rounded-md border",
    });
    const link = screen.getByRole("link", { name: /7 unread notifications/i });
    expect(link.className).toContain("h-9 w-9");
  });
});
