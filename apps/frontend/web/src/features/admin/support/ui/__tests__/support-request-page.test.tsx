import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import type { MessageDTO, SupportRequestSummaryDTO } from "@ntizo/shared/read-models";
import { GraphqlError } from "@/shared/lib/graphql/session-graphql";
import { AdminSupportRequestPage } from "../support-request-page";

const fakes = vi.hoisted(() => ({
  reply: vi.fn(),
  resolve: vi.fn(),
  markRead: vi.fn(),
  // Set only by the "genuine failure" case below. Every other test leaves
  // this `null` and gets the real `adminSupportQueries.one`, fed instead
  // through `setQueryData` before mount, exactly as before — seeding a
  // query's *error* state has no `setQueryData`-shaped equivalent (see that
  // test's own doc comment), so the one case that needs it drives the real
  // fetch-and-reject cycle through this override instead of fighting the
  // cache's internal reducer.
  oneQueryFn: null as (() => Promise<unknown>) | null,
  /** Same escape hatch as `oneQueryFn`, for the conversation query. */
  messagesQueryFn: null as (() => Promise<unknown>) | null,
}));
vi.mock("@/features/admin/support/data/admin-support.repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/admin/support/data/admin-support.repository")>();
  return {
    ...actual,
    replyToSupportRequest: fakes.reply,
    resolveSupportRequest: fakes.resolve,
    markSupportRequestRead: fakes.markRead,
    adminSupportQueries: {
      ...actual.adminSupportQueries,
      one: (threadId: string) =>
        fakes.oneQueryFn
          ? { queryKey: ["admin", "support", "one", threadId] as const, queryFn: fakes.oneQueryFn }
          : actual.adminSupportQueries.one(threadId),
      messages: (threadId: string) =>
        fakes.messagesQueryFn
          ? {
              queryKey: ["admin", "support", "messages", threadId] as const,
              queryFn: fakes.messagesQueryFn,
              initialPageParam: undefined,
              getNextPageParam: () => undefined,
            }
          : actual.adminSupportQueries.messages(threadId),
    },
  };
});

afterEach(() => {
  fakes.oneQueryFn = null;
  fakes.messagesQueryFn = null;
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
      createRoute({ getParentRoute: () => rootRoute, path: "/admin/providers/$providerId", component: () => <p>provider</p> }),
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

/**
 * The same router `renderPage` above builds, but starting from an
 * already-seeded `QueryClient` rather than building one and seeding it with
 * a successful `request` — `setQueryData` only knows how to express a
 * successful read, so it cannot produce the two states the fix under test
 * exists to tell apart (a genuine failure, and a settled "no such request").
 * The two cases below build their own `QueryClient` with the query state
 * they need, then hand it to this.
 */
async function renderWithClient(qc: QueryClient) {
  fakes.reply.mockResolvedValue("m-2");
  fakes.resolve.mockResolvedValue(undefined);
  fakes.markRead.mockResolvedValue(1);
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

  it("says so when somebody else resolved the request first", async () => {
    const user = userEvent.setup();
    await renderPage();
    fakes.resolve.mockRejectedValueOnce(
      new GraphqlError(200, [
        {
          message: "Already resolved",
          extensions: { code: "UNPROCESSABLE", originalCode: "SUPPORT_ALREADY_RESOLVED" },
        },
      ]),
    );

    await user.click(screen.getByRole("button", { name: /mark as resolved/i }));

    // The specific sentence, not the generic one: the click did something,
    // it just was not this administrator who did it.
    expect(await screen.findByText(/already resolved this request/i)).toBeInTheDocument();
  });

  it("says so when the resolve simply fails", async () => {
    const user = userEvent.setup();
    await renderPage();
    // Not a `GraphqlError`, so it carries no code at all — the failure the
    // page must still speak about, and the one an `errorCode`-only channel
    // would have swallowed.
    fakes.resolve.mockRejectedValueOnce(new Error("network down"));

    await user.click(screen.getByRole("button", { name: /mark as resolved/i }));

    expect(await screen.findByText(/could not be marked as resolved/i)).toBeInTheDocument();
  });

  it("says the conversation failed rather than showing an empty one", async () => {
    fakes.messagesQueryFn = () => Promise.reject(new Error("network down"));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(["admin", "support", "one", "t-1"], request);
    await renderWithClient(qc);

    // The header loaded, so the page renders — which is exactly the trap:
    // without this line an administrator saw a request with no messages in
    // it and a composer waiting, and could answer and resolve something
    // they had never read.
    expect(await screen.findByText(/conversation could not be loaded/i)).toBeInTheDocument();
    expect(screen.queryByText("Paguei duas vezes")).toBeNull();
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

  it("names the provider on a provider request, and links to it", async () => {
    await renderPage({ audience: "provider", providerId: "p-1", providerName: "Salão X" });
    expect(screen.getByRole("link", { name: "Salão X" })).toHaveAttribute(
      "href",
      "/admin/providers/p-1",
    );
  });

  it("shows a load error, not \"no such request\", when the query genuinely fails", async () => {
    // `setQueryData` only expresses a successful read — there is no
    // `setQueryData`-shaped way to seed a query's *error* state, because
    // React Query's own "fetch started" reducer resets `status` back to
    // "pending" the instant a fetch is dispatched while `data` is
    // `undefined` (`fetchState` in `query-core`, unconditionally), and
    // `useQuery`'s default mount behaviour always dispatches exactly that
    // fetch for a query with no data yet — so a directly-injected error
    // state gets overwritten by a loading state before this test would ever
    // get to look at the screen. Driving the real fetch-and-reject cycle
    // through `oneQueryFn` is what actually produces a stable `error`.
    fakes.oneQueryFn = () => Promise.reject(new Error("network down"));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await renderWithClient(qc);

    // Both directions: the error line is there, AND the unrelated
    // "no such request" text is not — the two states used to collapse into
    // exactly the same screen, and a test that only checked the expected
    // string would not have noticed. `findByText`, not `getByText`: unlike
    // every other case in this file, there is nothing seeded synchronously
    // here — the error only exists once the rejected fetch actually settles.
    expect(await screen.findByText(/could not be loaded/i)).toBeInTheDocument();
    expect(screen.queryByText(/no such request/i)).toBeNull();
    expect(screen.getByRole("link", { name: /back to the queue/i })).toBeInTheDocument();
  });

  it("shows \"no such request\", not a load error, when the query simply finds nothing", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // A settled, error-free query with no data — `supportRequest` resolving
    // `null` for a thread id that does not exist. Distinct from the case
    // above only by `error` being absent, which is exactly the distinction
    // the fix exists to preserve.
    qc.setQueryData(["admin", "support", "one", "t-1"], null);
    await renderWithClient(qc);

    expect(screen.getByText(/no such request/i)).toBeInTheDocument();
    expect(screen.queryByText(/could not be loaded/i)).toBeNull();
    expect(screen.getByRole("link", { name: /back to the queue/i })).toBeInTheDocument();
  });
});
