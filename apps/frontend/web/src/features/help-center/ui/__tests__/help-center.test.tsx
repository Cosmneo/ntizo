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

async function renderAt(pathname: string) {
  fakes.requests.mockReturnValue({ requests: [], loading: false, hasMore: false, loadMore: vi.fn() });
  const rootRoute = createRootRoute();
  const router = createRouter({
    routeTree: rootRoute.addChildren(
      ["/", "/messages", "/sign-in", "/help", "/admin", "/book/$id"].map((path) =>
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
  });

  it("is absent where it must not appear", async () => {
    fakes.currentUser.mockReturnValue({ data: null });
    await renderAt("/admin");
    expect(screen.queryByRole("button", { name: /help/i })).toBeNull();
  });
});
