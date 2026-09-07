import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { FavouriteListDTO } from "@ntizo/shared/read-models";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useTranslation } from "react-i18next";
import * as client from "@/shared/lib/graphql/session-graphql";
import { listDisplayName } from "../../domain/list-name";
import { useCreateList } from "../use-create-list";
import { useMyLists } from "../use-my-lists";

/** Same one-line re-export the marks tests mock, for the same reason. */
const session = vi.hoisted(() => ({ data: null as { user: { id: string } } | null }));
vi.mock("@/shared/hooks/use-session", () => ({
  useSession: () => ({ data: session.data }),
}));

const SIGNED_IN = { user: { id: "u1" } };

function list(over: Partial<FavouriteListDTO> = {}): FavouriteListDTO {
  return { id: "l1", name: null, isDefault: true, itemCount: 3, coverUrls: [], ...over };
}

function installFakeServer(lists: FavouriteListDTO[] = []) {
  const server = { lists: [...lists] };

  const spy = vi
    .spyOn(client, "sessionGraphql")
    .mockImplementation(async (query, variables) => {
      const text = String(query);
      const input = (variables?.input ?? {}) as { name?: string };

      if (text.includes("favouriteListMine")) {
        return { favouriteListMine: server.lists } as never;
      }
      if (text.includes("favouriteListCreate")) {
        const created = list({
          id: `l${server.lists.length + 1}`,
          name: input.name ?? null,
          isDefault: false,
          itemCount: 0,
        });
        server.lists = [...server.lists, created];
        return { favouriteListCreate: { id: created.id } } as never;
      }
      throw new Error(`the page asked something this fake server does not answer: ${text}`);
    });

  return { server, spy };
}

/**
 * Rows are named through `listDisplayName` with a **real** `t`, bound to the
 * `directory` namespace on purpose.
 *
 * That is where the default list's name stops being a rule and becomes a word:
 * `domain/__tests__/list-name.test.ts` cannot reach the app's i18n instance
 * (the boundaries policy allows `domain -> domain` only), so this is the one
 * place that proves `common:favouritesDefaultList` exists in the real `en-US`
 * bundle — and that its `common:` qualification survives a caller holding some
 * other namespace, which is exactly what a listing card will be holding.
 */
function ListsPanel() {
  const { t } = useTranslation("directory");
  const { lists } = useMyLists();
  const { createList } = useCreateList();
  return (
    <div>
      <button type="button" onClick={() => createList("Casa nova")}>
        new list
      </button>
      <span data-testid="count">{lists.length}</span>
      <ul>
        {lists.map((l) => (
          <li key={l.id}>{listDisplayName(l, t)}</li>
        ))}
      </ul>
    </div>
  );
}

function renderPanel(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <>{ui}</>,
  });
  const signInRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/sign-in",
    validateSearch: (search: Record<string, unknown>) => search as { next?: string },
    component: () => <p>sign in page</p>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, signInRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });

  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
    router,
  };
}

beforeEach(() => {
  session.data = SIGNED_IN;
});

afterEach(() => {
  vi.restoreAllMocks();
  session.data = null;
});

describe("useMyLists", () => {
  it("reads the caller's lists in the order the server sent them", async () => {
    // The server puts the default list first on purpose — it is where the
    // heart saves, and the dialog's pre-ticked row belongs at the top rather
    // than somewhere down the scroll. Re-sorting here would undo that.
    installFakeServer([
      list({ id: "l1", name: null, isDefault: true }),
      list({ id: "l2", name: "Casa nova", isDefault: false }),
    ]);

    renderPanel(<ListsPanel />);

    await waitFor(() => expect(screen.getByTestId("count")).toHaveTextContent("2"));
    const rendered = screen.getAllByRole("listitem").map((li) => li.textContent);
    // "Favourites" out of the real `en-US` bundle for the null-named default
    // row, not the key id — see `ListsPanel`'s doc comment.
    expect(rendered).toEqual(["Favourites", "Casa nova"]);
  });

  it("asks nothing at all when signed out", async () => {
    const { spy } = installFakeServer([list()]);
    session.data = null;

    renderPanel(<ListsPanel />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByTestId("count")).toHaveTextContent("0");
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("useCreateList", () => {
  it("adds the list and lets the invalidated read show it", async () => {
    installFakeServer([list({ id: "l1", name: null, isDefault: true })]);
    const user = userEvent.setup();

    renderPanel(<ListsPanel />);
    await waitFor(() => expect(screen.getByTestId("count")).toHaveTextContent("1"));

    await user.click(screen.getByRole("button", { name: "new list" }));

    await waitFor(() => expect(screen.getByTestId("count")).toHaveTextContent("2"));
    expect(screen.getByText("Casa nova")).toBeInTheDocument();
  });

  it("sends a signed-out reader to sign in rather than firing", async () => {
    const { spy } = installFakeServer();
    session.data = null;
    const user = userEvent.setup();

    const { router } = renderPanel(<ListsPanel />);
    // `findBy`, not `getBy`: RouterProvider resolves its first match
    // asynchronously, so nothing is on screen on the very first tick.
    await user.click(await screen.findByRole("button", { name: "new list" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/sign-in"));
    expect(router.state.location.search).toEqual({ next: "/" });
    expect(spy).not.toHaveBeenCalled();
  });
});
