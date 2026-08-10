import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LandingPage } from "./landing-page";

function renderInRouter() {
  const rootRoute = createRootRoute();
  const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: LandingPage });
  const signIn = createRoute({ getParentRoute: () => rootRoute, path: "/sign-in", component: () => <div>signin</div> });
  const admin = createRoute({ getParentRoute: () => rootRoute, path: "/admin", component: () => <div>admin</div> });
  const signUp = createRoute({ getParentRoute: () => rootRoute, path: "/sign-up", component: () => <div>signup</div> });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, signIn, admin, signUp]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  // The header now reads the session to decide between the sign-in pill and
  // the account cluster, so the page needs a QueryClient. Retries off and no
  // seeded data: the signed-out branch is what this test is about.
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("LandingPage", () => {
  it("renders the hero and an internal Sign in link", async () => {
    renderInRouter();
    // Matched on the heading rather than an exact text node: the headline is
    // one h1 split across a coloured span and a line break, so no single
    // element holds "Find it." on its own any more.
    expect(await screen.findByRole("heading", { level: 1, name: /find it/i })).toBeInTheDocument();
    const signIn = screen.getByRole("link", { name: "Sign in" });
    expect(signIn.getAttribute("href")).toBe("/sign-in");
  });

  it("shows the sections that give the page something to say", async () => {
    // The old page ended at the hero. These four are the reason it does not.
    renderInRouter();
    for (const heading of [
      "Service categories",
      "Popular services",
      "Customer stories",
    ]) {
      expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
    }
  });

  it("sends the search to the provider directory", async () => {
    renderInRouter();
    expect(await screen.findByLabelText("Search services")).toBeInTheDocument();
  });
});
