import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { Footer } from "../footer";

/**
 * The footer's promises, pinned.
 *
 * The Empresa column used to be six `href="#"` links; it is now five routes
 * that exist (the help center adds its two when `/help` lands — follow-ups #132). The payment row used to advertise four methods the checkout
 * refuses; it now names the one that charges. Both are the kind of thing a
 * later edit quietly puts back.
 */
// `await router.load()` before `render()`, matching every other suite that
// mounts a `RouterProvider` here (`checkout-header`, `user-menu`,
// `notification-bell-link`, `header-actions`, `service-search`): this router
// commits its first match through an async transition, so a synchronous
// `getByRole` right after `render()` finds nothing yet.
async function renderFooter() {
  const rootRoute = createRootRoute();
  const stub = (path: string) =>
    createRoute({ getParentRoute: () => rootRoute, path, component: () => <p>{path}</p> });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: "/", component: Footer }),
      ...["/about", "/contact", "/feedback", "/become-provider", "/careers", "/terms", "/privacy", "/admin"].map(stub),
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
}

describe("Footer", () => {
  it("links the five company pages that exist, in the reference's order", async () => {
    await renderFooter();
    const company = screen.getByRole("heading", { name: /^company$/i }).parentElement!;
    const hrefs = Array.from(company.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/about", "/contact", "/feedback?from=%2F", "/become-provider", "/careers"]);
  });

  it("prints the support address on the ntizo.co.mz domain and nothing on .com", async () => {
    await renderFooter();
    expect(screen.getByRole("link", { name: "suporte@ntizo.co.mz" })).toHaveAttribute("href", "mailto:suporte@ntizo.co.mz");
    expect(document.body.textContent).not.toContain("ntizo.com");
  });

  it("advertises only the payment method the checkout actually charges", async () => {
    await renderFooter();
    expect(screen.getByText("M-Pesa")).toBeInTheDocument();
    expect(screen.queryByText("e-Mola")).toBeNull();
    expect(screen.queryByText("Visa")).toBeNull();
    expect(screen.queryByText("Mastercard")).toBeNull();
  });
});
