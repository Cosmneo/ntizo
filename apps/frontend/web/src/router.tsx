import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { routeTree } from "./routeTree.gen";
import { queryClient } from "@/lib/query-client";

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    context: { queryClient },
    basepath: "/",
    defaultPreload: "intent",
    scrollRestoration: true,
  });

  // Bridges TanStack Query's cache across the SSR boundary so a server-rendered
  // route's data hydrates instead of refetching on mount.
  setupRouterSsrQueryIntegration({ router, queryClient });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
