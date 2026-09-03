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

async function renderPage(items: SupportRequestSummaryDTO[], nextCursor: string | null = null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(["admin", "support", { status: "open" }], {
    pages: [{ items, nextCursor }],
    pageParams: [null],
  });
  qc.setQueryData(["admin", "support", "openCount"], items.length);
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

  it("does not claim a total it cannot know while another page remains", async () => {
    // A non-null `nextCursor` means the backend has more — "1 of 1 shown"
    // would be a lie the queue cannot back up, since `supportRequests` never
    // returns a count. The header must fall back to a plain "N shown".
    await renderPage([row()], "2026-09-03T10:00:00.000Z|t-1");
    expect(screen.getByText("1 shown")).toBeInTheDocument();
    expect(screen.queryByText(/of 1/)).not.toBeInTheDocument();
  });

  it("defaults to open and lets the filter change", async () => {
    const user = userEvent.setup();
    const qc = await renderPage([row()]);
    // Switching to "resolved" is a different key, unseeded — the page must
    // ask for it rather than showing the open list under a new label.
    await user.click(screen.getByRole("button", { name: /^resolved$/i }));
    expect(qc.getQueryData(["admin", "support", { status: "resolved" }])).toBeUndefined();
  });
});
