import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
} from "@tanstack/react-router";
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
  render(<RouterProvider router={router} />);
}

describe("LandingPage", () => {
  it("renders the hero and an internal Sign in link", async () => {
    renderInRouter();
    expect(await screen.findByText("Find it.")).toBeInTheDocument();
    const signIn = screen.getByRole("link", { name: "Sign in" });
    expect(signIn.getAttribute("href")).toBe("/sign-in");
  });
});
