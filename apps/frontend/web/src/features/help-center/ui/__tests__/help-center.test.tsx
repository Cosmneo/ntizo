import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { HelpCenterProvider } from "@/features/help-center/viewmodel/use-help-center";
import { HelpCenter } from "../help-center";

const fakes = vi.hoisted(() => ({
  currentUser: vi.fn(),
  requests: vi.fn(),
  openRequest: vi.fn(),
  activeProvider: vi.fn(),
  refreshWorkspace: vi.fn(),
}));

vi.mock("@/features/user/viewmodel/use-current-user", () => ({
  useCurrentUser: fakes.currentUser,
  fetchCurrentUser: vi.fn(),
}));
vi.mock("@/features/help-center/viewmodel/use-support-requests", () => ({
  useSupportRequests: fakes.requests,
}));
vi.mock("@/features/help-center/viewmodel/use-open-support-request", () => ({
  useOpenSupportRequest: () => ({ openRequest: fakes.openRequest, opening: false, errorCode: undefined }),
}));
vi.mock("@/features/provider/viewmodel/use-active-provider", () => ({
  useActiveProvider: fakes.activeProvider,
}));

/** The workspace query's three settled shapes, named so the tests read as what they are. */
const workspace = {
  none: { activeProvider: null, providers: [], loading: false, error: null },
  loading: { activeProvider: null, providers: [], loading: true, error: null },
  failed: { activeProvider: null, providers: [], loading: false, error: "network down" },
  resolved: {
    activeProvider: { id: "p-1", name: "Salão X", slug: "salao-x" },
    providers: [{ id: "p-1", name: "Salão X", slug: "salao-x" }],
    loading: false,
    error: null,
  },
};

async function renderAt(
  pathname: string,
  provider: (typeof workspace)[keyof typeof workspace] = workspace.none,
) {
  fakes.requests.mockReturnValue({ requests: [], loading: false, hasMore: false, loadMore: vi.fn() });
  fakes.activeProvider.mockReturnValue({
    ...provider,
    setActive: vi.fn(),
    refresh: fakes.refreshWorkspace,
  });
  const rootRoute = createRootRoute();
  const router = createRouter({
    routeTree: rootRoute.addChildren(
      ["/", "/messages", "/sign-in", "/help", "/admin", "/book/$id", "/provider/$slug/overview"].map((path) =>
        createRoute({
          getParentRoute: () => rootRoute,
          path,
          component: () => (
            <HelpCenterProvider>
              <HelpCenter />
            </HelpCenterProvider>
          ),
        }),
      ),
    ),
    history: createMemoryHistory({ initialEntries: [pathname] }),
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await router.load();
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe("HelpCenter", () => {
  it("offers the FAQ to a signed-out reader, and a way in instead of a form", async () => {
    fakes.currentUser.mockReturnValue({ data: null });
    const user = userEvent.setup();
    await renderAt("/");

    await user.click(screen.getByRole("button", { name: /help/i }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // A popular question is on the home screen without signing in.
    expect(screen.getByText(/when do I pay/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/subject/i)).toBeNull();
  });

  it("searches the answers as you type", async () => {
    fakes.currentUser.mockReturnValue({ data: null });
    const user = userEvent.setup();
    await renderAt("/");
    await user.click(screen.getByRole("button", { name: /help/i }));

    await user.type(screen.getByLabelText(/search help/i), "M-Pesa");

    expect(screen.getByText(/which payment methods/i)).toBeInTheDocument();
    expect(screen.queryByText(/how do I leave a review/i)).toBeNull();
  });

  it("keeps a signed-out searcher on the way in, not the form, when nothing matches", async () => {
    fakes.currentUser.mockReturnValue({ data: null });
    const user = userEvent.setup();
    await renderAt("/");
    await user.click(screen.getByRole("button", { name: /help/i }));

    await user.type(screen.getByLabelText(/search help/i), "xyzxyz123");
    await user.click(screen.getByRole("button", { name: /talk to us/i }));

    expect(screen.getByRole("link", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/subject/i)).toBeNull();
  });

  it("lets a signed-in reader open a request, and shows the conversation", async () => {
    fakes.currentUser.mockReturnValue({ data: { id: "u-1", role: "customer" } });
    fakes.openRequest.mockResolvedValue("t-1");
    const user = userEvent.setup();
    await renderAt("/");

    await user.click(screen.getByRole("button", { name: /help/i }));
    await user.click(screen.getByRole("button", { name: /send a message/i }));
    await user.type(screen.getByLabelText(/subject/i), "Reembolso");
    await user.type(screen.getByLabelText(/message body/i), "Paguei duas vezes");
    await user.click(screen.getByRole("button", { name: /^send$/i }));

    expect(fakes.openRequest).toHaveBeenCalledWith({
      audience: "customer",
      subject: "Reembolso",
      body: "Paguei duas vezes",
      attachments: [],
    });

    // The new thread is not in `fakes.requests`' (still-invalidating) list
    // for this test's whole run, so this is exactly the beat right after
    // creation: the conversation must render its own loading state, not
    // nothing — the form's own subject field is gone (we have left "new"),
    // and the conversation's composer is already there.
    expect(await screen.findByLabelText(/message body/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/subject/i)).toBeNull();
  });

  it("sends a signed-out reader to sign in, carrying where they were, and gets out of the way", async () => {
    fakes.currentUser.mockReturnValue({ data: null });
    const user = userEvent.setup();
    const router = await renderAt("/help");

    await user.click(screen.getByRole("button", { name: /help/i }));
    await user.click(screen.getByRole("link", { name: /sign in/i }));

    // Where they asked for help, so signing in returns them to it.
    expect(router.state.location.pathname).toBe("/sign-in");
    expect(router.state.location.search).toEqual({ next: "/help" });
    // And the modal is gone: it used to sit over the sign-in form with a
    // backdrop that ate every click and a focus trap that ate every Tab.
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the answer to the popular question that was clicked, and keeps the search field in reach", async () => {
    fakes.currentUser.mockReturnValue({ data: null });
    const user = userEvent.setup();
    await renderAt("/");
    await user.click(screen.getByRole("button", { name: /help/i }));

    await user.click(screen.getByRole("button", { name: /when do I pay/i }));

    // The answer, not a second copy of the question waiting to be clicked
    // again — the FAQ screen seeds the open answer from the search.
    expect(screen.getByText(/never before/i)).toBeInTheDocument();
    // And a field saying why nineteen questions are missing, with a way to
    // clear it that is not the Back button.
    expect(screen.getByLabelText(/search help/i)).toHaveValue(
      screen.getByRole("button", { name: /when do I pay/i }).textContent,
    );
  });

  it("will not let a provider request be sent before it knows the workspace", async () => {
    fakes.currentUser.mockReturnValue({ data: { id: "u-1", role: "customer" } });
    const user = userEvent.setup();
    await renderAt("/provider/salao-x/overview", workspace.loading);

    await user.click(screen.getByRole("button", { name: /help/i }));
    await user.click(screen.getByRole("button", { name: /send a message/i }));
    await user.type(screen.getByLabelText(/subject/i), "Pagamento");
    await user.type(screen.getByLabelText(/message body/i), "Não recebi o pagamento");

    // Subject and body are both valid, so the only thing holding the button
    // is the workspace — and the reader is told, rather than being sent to a
    // backend that answers "you don't belong to this provider".
    expect(screen.getByText(/checking which provider/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^send$/i })).toBeDisabled();
  });

  it("says the workspace failed instead of a skeleton that never resolves", async () => {
    fakes.currentUser.mockReturnValue({ data: { id: "u-1", role: "customer" } });
    const user = userEvent.setup();
    await renderAt("/provider/salao-x/overview", workspace.failed);

    await user.click(screen.getByRole("button", { name: /help/i }));
    await user.click(screen.getByRole("button", { name: /my requests/i }));

    expect(screen.getByText(/couldn't tell which provider/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(fakes.refreshWorkspace).toHaveBeenCalled();
  });

  it("names the workspace on the form once it is known", async () => {
    fakes.currentUser.mockReturnValue({ data: { id: "u-1", role: "customer" } });
    const user = userEvent.setup();
    await renderAt("/provider/salao-x/overview", workspace.resolved);

    await user.click(screen.getByRole("button", { name: /help/i }));
    await user.click(screen.getByRole("button", { name: /send a message/i }));
    await user.type(screen.getByLabelText(/subject/i), "Pagamento");
    await user.type(screen.getByLabelText(/message body/i), "Não recebi o pagamento");

    expect(screen.getByText(/on behalf of Salão X/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^send$/i })).toBeEnabled();
  });

  it("is absent where it must not appear", async () => {
    fakes.currentUser.mockReturnValue({ data: null });
    await renderAt("/admin");
    expect(screen.queryByRole("button", { name: /help/i })).toBeNull();
  });
});
