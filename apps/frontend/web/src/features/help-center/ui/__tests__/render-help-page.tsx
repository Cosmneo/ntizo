import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { HelpCenterProvider } from "@/features/help-center/viewmodel/use-help-center";
import { HelpPage } from "@/features/help-center/ui/help-page";

/**
 * `HelpPage` in a router that knows every route the strip and the footer
 * link to, wrapped in `HelpCenterProvider` — the page's own contact button,
 * and the footer's "Falar com o suporte" underneath it, both call
 * `useHelpCenter()`.
 *
 * Copied from `features/company/ui/__tests__/render-company-page.tsx` (see
 * that file for why `await router.load()` runs before `render()`, and why
 * the stub takes a function, not `ComponentType`), with `"/help"` added to
 * the stub list and registered as the page under test instead.
 */
export async function renderHelpPage(at = "/help", initialEntry = at) {
  const rootRoute = createRootRoute();
  const stub = (path: string) =>
    createRoute({ getParentRoute: () => rootRoute, path, component: () => <p>{path}</p> });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: at, component: HelpPage }),
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
