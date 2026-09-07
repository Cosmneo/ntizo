import type { ReactNode } from "react";
import { render } from "@testing-library/react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";

/**
 * The pages a notification row can link to, as stubs.
 *
 * `Link` resolves its `to` against the router's own tree, so a component
 * test that renders one needs these paths to exist — not their real pages,
 * just their shape. Each stub prints its own path, so a test can tell where
 * a click went without importing the page it would have opened.
 */
const STUB_PATHS = [
  "/bookings/$bookingId",
  "/messages",
  "/provider/$slug/bookings/$bookingId",
  "/provider/$slug/messages",
  "/admin/support/$threadId",
] as const;

/**
 * Renders `ui` at `/` inside a memory router, with the notification targets
 * registered as stub routes, plus any `routes` the subject links to.
 *
 * For component tests whose subject renders a `Link`. A page test that needs
 * its own route, search validation or a query client builds its router
 * itself — see `bookings-page.test.tsx` — because those are the things it is
 * testing; this helper is for the case where the router is only scaffolding.
 */
export async function renderWithRouter(ui: ReactNode, opts: { routes?: string[] } = {}) {
  const rootRoute = createRootRoute();
  const home = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <>{ui}</>,
  });
  const stubs = [...STUB_PATHS, ...(opts.routes ?? [])].map((path) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path,
      component: () => <p data-testid="stub-page">{path}</p>,
    }),
  );
  const router = createRouter({
    routeTree: rootRoute.addChildren([home, ...stubs]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
  return { router };
}
