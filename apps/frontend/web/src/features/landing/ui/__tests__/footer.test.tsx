import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { HelpCenterProvider } from "@/features/help-center/viewmodel/use-help-center";
import { HelpCenter } from "@/features/help-center/ui/help-center";
import { Footer } from "../footer";

/**
 * The footer's promises, pinned.
 *
 * The Empresa column used to be six `href="#"` links; it is now six routes
 * and a button that all do something — the help center's own two, "Falar
 * com o suporte" and "Perguntas frequentes", closed out follow-ups #132. The
 * payment row used to advertise four methods the checkout refuses; it now
 * names the one that charges. Both are the kind of thing a later edit
 * quietly puts back.
 */
// `await router.load()` before `render()`, matching every other suite that
// mounts a `RouterProvider` here (`checkout-header`, `user-menu`,
// `notification-bell-link`, `header-actions`, `service-search`): this router
// commits its first match through an async transition, so a synchronous
// `getByRole` right after `render()` finds nothing yet.
//
// `HelpCenter` rides beside `Footer` on the same route, and both sit inside
// a `QueryClientProvider` and a `HelpCenterProvider` — the footer's support
// button and the panel it opens both call `useHelpCenter()`, and the panel
// itself reads the session through `useCurrentUser()`.
async function renderFooter() {
  const rootRoute = createRootRoute();
  const stub = (path: string) =>
    createRoute({ getParentRoute: () => rootRoute, path, component: () => <p>{path}</p> });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({
        getParentRoute: () => rootRoute,
        path: "/",
        component: () => (
          <>
            <Footer />
            <HelpCenter />
          </>
        ),
      }),
      ...["/about", "/contact", "/help", "/feedback", "/become-provider", "/careers", "/terms", "/privacy", "/admin"].map(stub),
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await router.load();
  render(
    <QueryClientProvider client={qc}>
      <HelpCenterProvider>
        <RouterProvider router={router} />
      </HelpCenterProvider>
    </QueryClientProvider>,
  );
}

describe("Footer", () => {
  it("links the six company pages that exist, in the reference's order", async () => {
    await renderFooter();
    const company = screen.getByRole("heading", { name: /^company$/i }).parentElement!;
    const hrefs = Array.from(company.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/about", "/contact", "/help", "/feedback?from=%2F", "/become-provider", "/careers"]);
  });

  it("opens the panel from the support link rather than navigating", async () => {
    const user = userEvent.setup();
    await renderFooter();
    await user.click(screen.getByRole("button", { name: /talk to support/i }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
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
