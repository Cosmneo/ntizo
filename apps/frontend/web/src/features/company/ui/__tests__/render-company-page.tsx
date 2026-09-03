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
import { HelpCenterProvider } from "@/features/help-center/viewmodel/use-help-center";

/**
 * Every company page in a router that knows every route they link to. The
 * header reads the session, so a QueryClient is needed and left unseeded —
 * the signed-out branch is the one these pages are mostly read in. Every
 * company page ends in the same `Footer`, whose "Falar com o suporte" opens
 * the panel through `useHelpCenter()`, so a `HelpCenterProvider` wraps the
 * router too.
 *
 * `await router.load()` before `render()`, matching every other suite that
 * mounts a `RouterProvider` here (`user-menu`, `footer`): this router commits
 * its first match through an async transition, so a synchronous query right
 * after `render()` finds nothing yet.
 *
 * `FunctionComponent`, not `ComponentType`: `createRoute`'s `component` wants
 * a function (or lazy) component, and `ComponentType` widens to include class
 * components, which this router's types refuse.
 *
 * `initialEntry` defaults to `at`: most callers want the router to land
 * exactly on the route path they registered the page at. A caller that needs
 * a query string on the way in (a `?from=` carried into `/feedback`, say)
 * passes it separately — `at` still names the route path, `initialEntry` is
 * what history actually starts on.
 */
export async function renderCompanyPage(Page: FunctionComponent, at = "/", initialEntry = at) {
  const rootRoute = createRootRoute();
  const stub = (path: string) =>
    createRoute({ getParentRoute: () => rootRoute, path, component: () => <p>{path}</p> });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: at, component: Page }),
      ...[
        "/about", "/contact", "/feedback", "/careers", "/help",
        "/", "/services", "/providers", "/become-provider", "/sign-in", "/sign-up",
        "/terms", "/privacy", "/admin",
      ].filter((p) => p !== at).map(stub),
    ]),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
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
  return { qc };
}
