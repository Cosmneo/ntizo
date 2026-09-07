import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import type { SupportRequestSummaryDTO } from "@ntizo/shared/read-models";
import { AdminSupportPage } from "../support-page";

function row(over: Partial<SupportRequestSummaryDTO> = {}): SupportRequestSummaryDTO {
  return {
    threadId: "t-1", audience: "customer", subject: "Reembolso", status: "open",
    requesterUserId: "u-1", requesterName: "Ana Silva", providerId: null, providerName: "",
    bookingId: null, lastMessageAt: "2026-09-03T10:00:00.000Z", lastMessagePreview: "Paguei duas vezes",
    unreadForAdmin: 1, createdAt: "2026-09-03T09:00:00.000Z", resolvedAt: null, ...over,
  };
}

async function renderPage(items: SupportRequestSummaryDTO[], nextCursor: string | null = null, openCount = items.length) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(["admin", "support", { status: "open" }], {
    pages: [{ items, nextCursor }],
    pageParams: [null],
  });
  qc.setQueryData(["admin", "support", "openCount"], openCount);
  const rootRoute = createRootRoute();
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: "/", component: AdminSupportPage }),
      createRoute({ getParentRoute: () => rootRoute, path: "/admin/support/$threadId", component: () => <p>one</p> }),
      createRoute({ getParentRoute: () => rootRoute, path: "/admin/providers/$providerId", component: () => <p>provider</p> }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return qc;
}

describe("AdminSupportPage", () => {
  it("lists an open request with who wrote it, its subject and its unread count", async () => {
    await renderPage([row()]);
    const t = within(screen.getByRole("table"));
    expect(t.getByText("Reembolso")).toBeInTheDocument();
    expect(t.getByText("Ana Silva")).toBeInTheDocument();
    expect(t.getByText("1")).toBeInTheDocument();
  });

  it("names the provider on a provider request, and links to it", async () => {
    await renderPage([row({ audience: "provider", providerId: "p-1", providerName: "Salão X", requesterName: "Bruno" })]);
    const t = within(screen.getByRole("table"));
    expect(t.getByRole("link", { name: "Salão X" })).toHaveAttribute("href", "/admin/providers/p-1");
  });

  it("links each row to the request", async () => {
    await renderPage([row()]);
    expect(within(screen.getByRole("table")).getByRole("link", { name: /Reembolso/ })).toHaveAttribute(
      "href",
      "/admin/support/t-1",
    );
  });

  it("counts the page against the platform's open requests while the queue is on open", async () => {
    // `supportRequests` never returns a count, but the open count is the
    // whole this page exists to bring down — so with more pages behind a
    // one-row page, the header says "1 of 3 shown" rather than "1 shown".
    await renderPage([row()], "2026-09-03T10:00:00.000Z|t-1", 3);
    expect(screen.getByText("1 of 3 shown")).toBeInTheDocument();
  });

  it("keeps its filters in the shared panel, and asks for resolved requests as a different list", async () => {
    const user = userEvent.setup();
    const qc = await renderPage([row()]);
    // Nothing loose above the card: the only way to a filter is the card's own button.
    expect(screen.queryByRole("button", { name: /^resolved$/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^filter/i }));
    const panel = screen.getByRole("dialog", { name: "Filter requests" });
    await user.click(within(panel).getByRole("button", { name: "Status" }));
    await user.click(within(panel).getByRole("option", { name: "Resolved" }));

    // A different key, unseeded — the page must ask for it rather than show
    // the open list under a new label.
    expect(qc.getQueryData(["admin", "support", { status: "resolved" }])).toBeUndefined();
    expect(within(screen.getByRole("button", { name: /^filter/i })).getByText("1")).toBeInTheDocument();
  });

  it("searches on the server, by subject", async () => {
    const user = userEvent.setup();
    const qc = await renderPage([row()]);
    await user.type(screen.getByPlaceholderText("Search by subject"), "Reembolso");
    expect(qc.getQueryCache().find({ queryKey: ["admin", "support", { status: "open", search: "Reembolso" }] })).toBeDefined();
  });
});
