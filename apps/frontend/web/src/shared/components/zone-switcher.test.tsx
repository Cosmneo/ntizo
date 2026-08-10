import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  RouterProvider, createRootRoute, createRouter, createMemoryHistory,
} from "@tanstack/react-router";
import type { Zone } from "@/shared/lib/zones";
import { ZoneLinks } from "./zone-switcher";

async function renderLinks(zones: Zone[], current: Zone = "provider") {
  const root = createRootRoute({ component: () => <ZoneLinks zones={zones} current={current} /> });
  const router = createRouter({ routeTree: root, history: createMemoryHistory({ initialEntries: ["/provider"] }) });
  // TanStack Router resolves its initial match asynchronously; await it before
  // rendering so synchronous assertions below see the fully-mounted DOM
  // (same issue landing-page.test.tsx works around with `findByText`).
  await router.load();
  render(<RouterProvider router={router} />);
}

describe("ZoneLinks", () => {
  it("offers the customer and provider views to someone who has both", async () => {
    await renderLinks(["landing", "provider"]);
    expect(screen.getByRole("link", { name: "Customer" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Provider" })).toBeInTheDocument();
  });

  it("marks the current zone, so the pill shows where you are", async () => {
    await renderLinks(["landing", "provider"], "provider");
    expect(screen.getByRole("link", { name: "Provider" })).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(screen.getByRole("link", { name: "Customer" })).toHaveAttribute(
      "data-active",
      "false",
    );
  });

  it("keeps admin out of the pill even for an admin", async () => {
    // Admin is reachable from the account menu instead. Putting it here would
    // give a two-state control three states, and hand the everyday
    // customer/provider toggle a destination almost nobody wants.
    await renderLinks(["landing", "provider", "admin"]);
    expect(screen.queryByRole("link", { name: /admin/i })).toBeNull();
  });

  it("renders nothing when there is nowhere to switch to", async () => {
    // A plain customer. A lone "Customer" pill would imply a choice that
    // does not exist.
    await renderLinks(["landing"], "landing");
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders nothing for an admin who is not also a provider", async () => {
    // Filtering admin out can empty the pill entirely — it must not leave a
    // stray one-segment control behind.
    await renderLinks(["landing", "admin"], "admin");
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});
