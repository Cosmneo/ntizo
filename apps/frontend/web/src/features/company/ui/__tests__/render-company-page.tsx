import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type { FunctionComponent } from "react";

/**
 * Every company page in a router that knows every route they link to. The
 * header reads the session, so a QueryClient is needed and left unseeded —
 * the signed-out branch is the one these pages are mostly read in.
 *
 * `await router.load()` before `render()`, matching every other suite that
 * mounts a `RouterProvider` here (`user-menu`, `footer`): this router commits
 * its first match through an async transition, so a synchronous query right
 * after `render()` finds nothing yet.
 *
 * `FunctionComponent`, not `ComponentType`: `createRoute`'s `component` wants
 * a function (or lazy) component, and `ComponentType` widens to include class
 * components, which this router's types refuse.
 */
export async function renderCompanyPage(Page: FunctionComponent, at = "/") {
  const rootRoute = createRootRoute();
  const stub = (path: string) =>
    createRoute({ getParentRoute: () => rootRoute, path, component: () => <p>{path}</p> });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: at, component: Page }),
      ...[
        "/about", "/contact", "/feedback", "/careers",
        "/", "/services", "/providers", "/become-provider", "/sign-in", "/sign-up",
        "/terms", "/privacy", "/admin",
      ].filter((p) => p !== at).map(stub),
    ]),
    history: createMemoryHistory({ initialEntries: [at] }),
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await router.load();
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { qc };
}
