import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import type { CurrentUserDTO } from "@ntizo/shared";
import type { MessageDTO, SupportRequestSummaryDTO } from "@ntizo/shared/read-models";

/**
 * The REAL generated route tree — `routeTree.gen.ts` — not a hand-parented
 * stand-in. That distinction is the whole point: `book.$serviceId.test.tsx`
 * and `booking.$bookingId.details.test.tsx` both import the real `Route`
 * object but then declare their OWN parent chain by hand
 * (`getParentRoute: () => rootRoute`), which proves the route's own
 * `beforeLoad`/`validateSearch`/loader but says nothing about where the file
 * generator actually nests it — and nesting is exactly what broke here.
 *
 * `routes/admin/support.tsx` was un-suffixed while a sibling
 * `support.$threadId.tsx` existed, which — per `routes/providers.index.tsx`'s
 * own doc comment on the identical bug — made the queue a LAYOUT route for
 * the detail route rather than its sibling. Nesting alone would not have
 * shown up in `router.state.matches`: TanStack Router still resolves
 * `/admin/support/t-1` to the `$threadId` route object regardless of which
 * route is its parent — matching is about the URL pattern, not about who
 * renders. The bug was invisible there and only visible on screen:
 * `AdminSupportPage` (the queue) renders no `<Outlet/>`, so when the detail
 * route was nested a level *under* it, the queue's own component tree never
 * handed control to the child match — the URL changed, the screen kept
 * showing the queue table. Only an actual render, through the real tree,
 * proves the right component mounted. Renaming to `support.index.tsx` fixes
 * the nesting; this test is what would have caught the regression, and what
 * stops it coming back the same way.
 */
const fakes = vi.hoisted(() => ({
  session: { user: { id: "admin-1" } } as { user: { id: string } } | null,
  user: { role: "admin" } as CurrentUserDTO,
}));

// The one gate between `/admin` and anything under it: mocked exactly as
// `booking.$bookingId.details.test.tsx` mocks it, for the same reason — an
// unmocked `authClient.getSession()` is a real network call this test must
// not make, and without a signed-in admin the guard bounces to /sign-in
// before either route ever gets a chance to mismatch.
vi.mock("@/shared/lib/api/auth-client", () => ({
  API_BASE_URL: "http://localhost",
  authClient: { getSession: async () => ({ data: fakes.session }) },
}));

vi.mock("@/features/user/data/user.repository", () => ({
  userQueries: {
    me: () => ({ queryKey: ["user", "me"], queryFn: async () => fakes.user }),
  },
  updateMyProfile: vi.fn(),
}));

const { routeTree } = await import("@/routeTree.gen");
const { Route: RootRoute } = await import("@/routes/__root");

/**
 * The real root route renders a literal `<html><head>…<body>` document
 * (`RootDocument` in `__root.tsx`) — correct for the SSR boundary
 * `tanstackStart()` owns, and incompatible with Testing Library's `render()`,
 * which appends its own container under jsdom's already-existing `<body>`:
 * mounting the unmodified tree nests a second `<html>` inside a `<div>` and
 * nothing below it ever renders.
 *
 * `Route.update()` shallow-merges (`Object.assign(this.options, options)` in
 * `router-core`'s own `route.js` — the same primitive `book.$serviceId.test.tsx`
 * relies on to re-parent a route), so overriding only `component` here
 * leaves every other option on the real root untouched, and — because
 * `routeTree.gen.ts` wires every deeper route, including the real `/admin`
 * guard and the real `/admin/support` nesting this suite exists to test,
 * through object references rather than copies — leaves the whole rest of
 * the real tree exactly as generated. This mutates the shared singleton
 * `@/routes/__root` exports, but Vitest isolates each test file's module
 * registry, so nothing outside this file ever observes it.
 */
RootRoute.update({ component: Outlet } as never);

const REQUEST: SupportRequestSummaryDTO = {
  threadId: "t-1", audience: "customer", subject: "Reembolso", status: "open",
  requesterUserId: "u-1", requesterName: "Ana Silva", providerId: null, providerName: "",
  bookingId: "b-1", lastMessageAt: "2026-09-03T10:00:00.000Z", lastMessagePreview: "Paguei duas vezes",
  unreadForAdmin: 1, createdAt: "2026-09-03T09:00:00.000Z", resolvedAt: null,
};

const MESSAGES: MessageDTO[] = [
  { id: "m-1", threadId: "t-1", senderUserId: "u-1", senderSide: "customer", body: "Paguei duas vezes", readAt: null, createdAt: "2026-09-03T09:00:00.000Z", attachments: [] },
];

function renderAt(path: string) {
  fakes.session = { user: { id: "admin-1" } };
  fakes.user = { role: "admin" } as CurrentUserDTO;

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // Seeded so the detail route's own data hooks resolve with no fetch — the
  // same technique `support-request-page.test.tsx` uses at the page level.
  // This suite is about which component mounts at which URL, not about that
  // component's own data plumbing, which the page-level suite already owns.
  queryClient.setQueryData(["admin", "support", "one", "t-1"], REQUEST);
  queryClient.setQueryData(["admin", "support", "messages", "t-1"], {
    pages: [{ items: MESSAGES, nextCursor: null }],
    pageParams: [null],
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [path] }),
  });

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
  );

  return { router };
}

describe("the generated route tree, at /admin/support", () => {
  it("renders the request page's own content at /admin/support/t-1 — not the queue's", async () => {
    renderAt("/admin/support/t-1");

    // Only `AdminSupportRequestPage` could put this exact heading on the
    // screen — the queue's rows carry the subject as a link's *text*, never
    // as a heading. Finding this heading proves the detail component
    // actually mounted, not merely that the router matched its route.
    expect(await screen.findByRole("heading", { name: "Reembolso" })).toBeInTheDocument();
  });

  it("still renders the queue at the bare /admin/support", async () => {
    renderAt("/admin/support");

    // The queue's own table — `AdminSupportRequestPage` has no `<table>` at
    // all — proving this URL still reaches `AdminSupportPage`. Nothing seeds
    // its own list query here; this test only needs the *other* URL to
    // still land on the queue, not to exercise the queue's own data path.
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });
});
