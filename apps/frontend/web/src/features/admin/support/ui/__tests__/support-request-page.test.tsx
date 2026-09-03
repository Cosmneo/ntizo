import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import type { MessageDTO, SupportRequestSummaryDTO } from "@ntizo/shared/read-models";
import { AdminSupportRequestPage } from "../support-request-page";

const fakes = vi.hoisted(() => ({ reply: vi.fn(), resolve: vi.fn(), markRead: vi.fn() }));
vi.mock("@/features/admin/support/data/admin-support.repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/admin/support/data/admin-support.repository")>();
  return {
    ...actual,
    replyToSupportRequest: fakes.reply,
    resolveSupportRequest: fakes.resolve,
    markSupportRequestRead: fakes.markRead,
  };
});

const request: SupportRequestSummaryDTO = {
  threadId: "t-1", audience: "customer", subject: "Reembolso", status: "open",
  requesterUserId: "u-1", requesterName: "Ana Silva", providerId: null, providerName: "",
  bookingId: "b-1", lastMessageAt: "2026-09-03T10:00:00.000Z", lastMessagePreview: "Paguei duas vezes",
  unreadForAdmin: 1, createdAt: "2026-09-03T09:00:00.000Z", resolvedAt: null,
};

const messages: MessageDTO[] = [
  { id: "m-1", threadId: "t-1", senderUserId: "u-1", senderSide: "customer", body: "Paguei duas vezes", readAt: null, createdAt: "2026-09-03T09:00:00.000Z", attachments: [] },
];

async function renderPage(over: Partial<SupportRequestSummaryDTO> = {}) {
  fakes.reply.mockResolvedValue("m-2");
  fakes.resolve.mockResolvedValue(undefined);
  fakes.markRead.mockResolvedValue(1);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(["admin", "support", "one", "t-1"], { ...request, ...over });
  qc.setQueryData(["admin", "support", "messages", "t-1"], { pages: [{ items: messages, nextCursor: null }], pageParams: [null] });
  const rootRoute = createRootRoute();
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: "/admin/support/$threadId", component: AdminSupportRequestPage }),
      createRoute({ getParentRoute: () => rootRoute, path: "/admin/support", component: () => <p>queue</p> }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/admin/support/t-1"] }),
  });
  await router.load();
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return qc;
}

describe("AdminSupportRequestPage", () => {
  it("shows the subject, who wrote it, the booking, and the conversation", async () => {
    await renderPage();
    expect(screen.getByRole("heading", { name: "Reembolso" })).toBeInTheDocument();
    expect(screen.getByText("Ana Silva")).toBeInTheDocument();
    expect(screen.getByText("b-1")).toBeInTheDocument();
    expect(screen.getByText("Paguei duas vezes")).toBeInTheDocument();
  });

  it("marks the request read when it opens", async () => {
    await renderPage();
    expect(fakes.markRead).toHaveBeenCalledWith("t-1");
  });

  it("sends a reply, and lets a phone number through", async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.type(screen.getByLabelText(/message body/i), "Ligue para 84 123 4567");
    await user.click(screen.getByRole("button", { name: /^send$/i }));
    expect(fakes.reply).toHaveBeenCalledWith("t-1", "Ligue para 84 123 4567", []);
  });

  it("resolves, and says a reply reopens it", async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.click(screen.getByRole("button", { name: /mark as resolved/i }));
    expect(fakes.resolve).toHaveBeenCalledWith("t-1");
  });

  it("offers no resolve button on an already-resolved request", async () => {
    await renderPage({ status: "resolved", resolvedAt: "2026-09-03T11:00:00.000Z" });
    expect(screen.queryByRole("button", { name: /mark as resolved/i })).toBeNull();
    // `/resolved/i` alone matches two elements here — the status Badge
    // ("Resolved") and this notice ("Marked as resolved...") — so
    // `getByText` throws on the ambiguity. "reopens" is unique to the
    // notice, and is the fact this test actually cares about: not just
    // that the status reads resolved, but that a reply reopens it.
    expect(screen.getByText(/reopens/i)).toBeInTheDocument();
  });
});
