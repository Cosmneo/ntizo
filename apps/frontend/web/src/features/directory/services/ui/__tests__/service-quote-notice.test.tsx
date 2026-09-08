import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import i18n from "@/shared/lib/i18n";
import { ServiceQuoteNotice } from "../service-quote-notice";

/**
 * Rendered inside a router and a `QueryClientProvider`, the same harness
 * `rail-price-summary.test.tsx` builds for the identical reason: the text
 * link this notice renders is the real `MessageProviderButton`, which reads
 * the current pathname and calls `useStartThread` (a `useMutation`) —
 * neither exists without both providers in the tree, even before anything
 * is clicked.
 *
 * `/quote/$serviceId` is registered as a stub route rather than imported for
 * real: a `ui` test may not reach into `src/routes/**`, and `Link` only
 * needs the path to resolve, not the page it opens.
 */
async function renderNotice({
  serviceId = "s1",
  providerId = "p1",
  providerName,
  quoteForm,
}: {
  serviceId?: string;
  providerId?: string;
  providerName: string;
  quoteForm: { responseHours: number } | null;
}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => (
      <ServiceQuoteNotice
        serviceId={serviceId}
        providerId={providerId}
        providerName={providerName}
        quoteForm={quoteForm}
      />
    ),
  });
  const quoteRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/quote/$serviceId",
    component: () => <p data-testid="stub-quote-page">quote request stub</p>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, quoteRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

// Portuguese, not the suite's default English: the mockup this panel
// implements was drawn in `pt-MZ`, and `entry.respondsIn`'s "responde em
// {{hours}} h" is a copy pinned below, not a shape a locale-agnostic
// assertion could stand in for.
beforeEach(async () => {
  await i18n.changeLanguage("pt-MZ");
});

afterEach(async () => {
  await i18n.changeLanguage("en-US");
});

describe("ServiceQuoteNotice", () => {
  it("offers the request as the panel's one button", async () => {
    await renderNotice({
      providerName: "Frio & Clima Maputo",
      quoteForm: { responseHours: 48 },
    });
    const action = await screen.findByRole("link", { name: "Pedir orçamento" });
    expect(action).toHaveAttribute("href", "/quote/s1");
  });

  it("keeps the message option, as text under the button", async () => {
    await renderNotice({ providerName: "Frio & Clima Maputo", quoteForm: null });
    expect(await screen.findByRole("button", { name: "Enviar mensagem" })).toBeInTheDocument();
  });

  it("says how fast the provider promised to answer, when they promised", async () => {
    await renderNotice({
      providerName: "Frio & Clima Maputo",
      quoteForm: { responseHours: 48 },
    });
    expect(await screen.findByText("responde em 48 h")).toBeInTheDocument();
  });

  it("says nothing about speed when the service has no quote form", async () => {
    await renderNotice({ providerName: "Frio & Clima Maputo", quoteForm: null });
    await screen.findByRole("link", { name: "Pedir orçamento" });
    expect(screen.queryByText(/responde em/)).not.toBeInTheDocument();
  });
});
