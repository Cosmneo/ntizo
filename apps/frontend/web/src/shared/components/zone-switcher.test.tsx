import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  RouterProvider, createRootRoute, createRoute, createRouter, createMemoryHistory,
} from "@tanstack/react-router";
import { ZoneLinks } from "./zone-switcher";

async function renderLinks(zones: Array<"landing" | "provider" | "admin">) {
  const root = createRootRoute({ component: () => <ZoneLinks zones={zones} current="provider" /> });
  const router = createRouter({ routeTree: root, history: createMemoryHistory({ initialEntries: ["/provider"] }) });
  // TanStack Router resolves its initial match asynchronously; await it before
  // rendering so synchronous assertions below see the fully-mounted DOM
  // (same issue landing-page.test.tsx works around with `findByText`).
  await router.load();
  render(<RouterProvider router={router} />);
}

describe("ZoneLinks", () => {
  it("renders only the accessible zones", async () => {
    await renderLinks(["landing", "provider"]);
    expect(screen.getByRole("link", { name: /landing/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /provider/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /admin/i })).toBeNull();
  });
});
