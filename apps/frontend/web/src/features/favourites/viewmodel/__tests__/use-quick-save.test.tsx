import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
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
import * as client from "@/shared/lib/graphql/session-graphql";
import { GraphqlError } from "@/shared/lib/graphql/session-graphql";
import { useFavouriteMarks } from "../use-favourite-marks";
import { useQuickSave } from "../use-quick-save";
import { useSetLists } from "../use-set-lists";

/**
 * The session, swapped per test.
 *
 * Mocked at `@/shared/hooks/use-session` — the one-line re-export — rather
 * than at `@/shared/lib/api/auth-client`, which also exports `API_BASE_URL`
 * that `session-graphql.ts` itself imports. Replacing the whole auth module
 * would quietly replace that too.
 */
const session = vi.hoisted(() => ({ data: null as { user: { id: string } } | null }));
vi.mock("@/shared/hooks/use-session", () => ({
  useSession: () => ({ data: session.data }),
}));

const SIGNED_IN = { user: { id: "u1" } };

/** A page of cards, the size a browse page actually renders. */
const IDS = Array.from({ length: 24 }, (_, i) => `s${i + 1}`);

/**
 * A promise a test holds open, so it can assert what the screen shows while
 * a mutation is still in flight — the whole point of an optimistic update is
 * what happens in exactly that window.
 */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * A fake server that actually remembers what was saved, rather than a mock
 * returning one canned answer.
 *
 * It matters here: every write invalidates `["favourites"]`, so the marks
 * query refetches straight after. A canned "nothing is saved" would come back
 * and contradict a save that had genuinely succeeded, and the tests would be
 * asserting against the mock's forgetfulness instead of the hooks.
 */
function installFakeServer(marked: string[] = []) {
  const server = {
    marked: new Set(marked),
    /** Set to make the marks query fail — see the rollback test. */
    marksFail: false,
    /** Set to hold the next write open (or fail it) instead of answering at once. */
    write: null as null | (() => Promise<unknown>),
  };

  const spy = vi
    .spyOn(client, "sessionGraphql")
    .mockImplementation(async (query, variables) => {
      const text = String(query);
      const input = (variables?.input ?? {}) as {
        targetId?: string;
        listIds?: string[];
      };

      if (text.includes("favouriteMarked")) {
        if (server.marksFail) throw new GraphqlError(500, [{ message: "boom" }]);
        return { favouriteMarked: [...server.marked] } as never;
      }
      if (text.includes("favouriteQuickSave")) {
        if (server.write) await server.write();
        server.marked.add(input.targetId!);
        return { favouriteQuickSave: { listIds: ["l-default"] } } as never;
      }
      if (text.includes("favouriteSetLists")) {
        if (server.write) await server.write();
        if ((input.listIds ?? []).length > 0) server.marked.add(input.targetId!);
        else server.marked.delete(input.targetId!);
        return { favouriteSetLists: { listIds: input.listIds ?? [] } } as never;
      }
      throw new Error(`the page asked something this fake server does not answer: ${text}`);
    });

  return { server, spy };
}

const isMarkedQuery = ([query]: [string, ...unknown[]]) =>
  String(query).includes("favouriteMarked");

/**
 * One card, standing in for the listing card Task 10 will build.
 *
 * **Every card asks for the whole page's ids**, deliberately: that is the
 * shape the sorted query key has to survive. Twenty-four cards asking the
 * same question must be one cache entry and one network call, or the heart
 * costs a round trip per card.
 */
function Card({ id }: { id: string }) {
  const { isMarked } = useFavouriteMarks("service", IDS);
  const { quickSave } = useQuickSave();
  const { setLists } = useSetLists();
  return (
    <div>
      <button type="button" onClick={() => quickSave("service", id)}>
        save {id}
      </button>
      <button type="button" onClick={() => setLists("service", id, [])}>
        untick every list for {id}
      </button>
      <span data-testid={`heart-${id}`}>{isMarked(id) ? "filled" : "empty"}</span>
    </div>
  );
}

function TwentyFourCards() {
  return (
    <>
      {IDS.map((id) => (
        <Card key={id} id={id} />
      ))}
    </>
  );
}

/** A page with nothing on it — the shape a filtered listing with no results has. */
function EmptyPage() {
  const { isMarked } = useFavouriteMarks("service", []);
  return <span data-testid="heart-none">{isMarked("s1") ? "filled" : "empty"}</span>;
}

/** The same page of cards asked about twice, in opposite orders. */
function TwoOrderingsOfTheSamePage() {
  const ascending = useFavouriteMarks("service", IDS);
  const descending = useFavouriteMarks("service", [...IDS].reverse());
  return (
    <>
      <span data-testid="heart-s3">{ascending.isMarked("s3") ? "filled" : "empty"}</span>
      <span data-testid="heart-s3-reversed">
        {descending.isMarked("s3") ? "filled" : "empty"}
      </span>
    </>
  );
}

function renderCards(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <>{ui}</>,
  });
  // The real route a signed-out tap lands on, registered so the redirect is
  // asserted against the router's own resolved location rather than a mocked
  // `navigate` call — the latter passes even when the `to`/`search` shape is
  // wrong in a way the mock never looks at.
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

describe("useQuickSave", () => {
  it("fills the heart before the server answers", async () => {
    // A heart that waits for a round trip on a patchy connection feels broken,
    // and the reader taps it again.
    const { server, spy } = installFakeServer();
    const user = userEvent.setup();

    renderCards(<TwentyFourCards />);
    await waitFor(() => expect(screen.getByTestId("heart-s1")).toHaveTextContent("empty"));

    const gate = deferred<null>();
    server.write = () => gate.promise;

    await user.click(screen.getByRole("button", { name: "save s1" }));

    // The server has said nothing at all yet — `gate` is still open.
    await waitFor(() => expect(screen.getByTestId("heart-s1")).toHaveTextContent("filled"));

    // And it stays filled once the server has answered and the invalidated
    // marks query has come back with the server's own truth: the optimistic
    // value was not a lie, and nothing overwrote it on the way through.
    gate.resolve(null);
    await waitFor(() =>
      expect(spy.mock.calls.filter(isMarkedQuery).length).toBeGreaterThan(1),
    );
    expect(screen.getByTestId("heart-s1")).toHaveTextContent("filled");
  });

  it("puts the heart back when the server refuses", async () => {
    // An optimistic update that never reverts is a lie the reader carries
    // until they reload.
    //
    // The marks query is made to fail alongside the write, and that is the
    // whole point of this test's shape: `onSettled` invalidates
    // `["favourites"]`, so a *working* refetch would put the heart back on
    // its own and this would pass with no rollback in the hook at all. With
    // the refetch failing, react-query keeps whatever is in the cache — which
    // is the optimistic `["s1"]` unless `onError` actually restored it.
    const { server } = installFakeServer();
    const user = userEvent.setup();

    renderCards(<TwentyFourCards />);
    await waitFor(() => expect(screen.getByTestId("heart-s1")).toHaveTextContent("empty"));

    const gate = deferred<null>();
    server.write = () => gate.promise;

    await user.click(screen.getByRole("button", { name: "save s1" }));
    await waitFor(() => expect(screen.getByTestId("heart-s1")).toHaveTextContent("filled"));

    server.marksFail = true;
    gate.reject(
      new GraphqlError(200, [
        {
          message: "Sign in to save",
          extensions: { code: "FORBIDDEN", originalCode: "UNAUTHENTICATED" },
        },
      ]),
    );

    await waitFor(() => expect(screen.getByTestId("heart-s1")).toHaveTextContent("empty"));
  });

  it("reads the marks once for a page of cards, not once per card", async () => {
    const { spy } = installFakeServer(["s3"]);

    renderCards(<TwentyFourCards />);
    await waitFor(() => expect(screen.getByTestId("heart-s3")).toHaveTextContent("filled"));

    expect(spy.mock.calls.filter(isMarkedQuery)).toHaveLength(1);
  });

  it("asks nothing at all when signed out", async () => {
    // Both queries are session-authed. Firing them anonymously trades a wall
    // of 401s for information the page cannot use.
    const { spy } = installFakeServer(["s3"]);
    session.data = null;

    renderCards(<TwentyFourCards />);
    // One turn of the loop, so a query that was going to fire has fired.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByTestId("heart-s3")).toHaveTextContent("empty");
    expect(spy).not.toHaveBeenCalled();
  });

  it("sends a signed-out reader to sign in, carrying the way back, instead of firing a mutation that can only fail", async () => {
    const { spy } = installFakeServer();
    session.data = null;
    const user = userEvent.setup();

    const { router } = renderCards(<TwentyFourCards />);
    // `findBy`, not `getBy`: RouterProvider resolves its first match
    // asynchronously, so nothing is on screen on the very first tick.
    await user.click(await screen.findByRole("button", { name: "save s1" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/sign-in"));
    expect(router.state.location.search).toEqual({ next: "/" });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("useSetLists", () => {
  it("empties the heart when the dialog unticks every list", async () => {
    // setLists([]) is how somebody removes a favourite. The marks cache has to
    // follow, or the card keeps a filled heart until a reload.
    const { server, spy } = installFakeServer(["s1"]);
    const user = userEvent.setup();

    renderCards(<TwentyFourCards />);
    await waitFor(() => expect(screen.getByTestId("heart-s1")).toHaveTextContent("filled"));

    const gate = deferred<null>();
    server.write = () => gate.promise;

    await user.click(screen.getByRole("button", { name: "untick every list for s1" }));

    // Again before the server has answered.
    await waitFor(() => expect(screen.getByTestId("heart-s1")).toHaveTextContent("empty"));

    // And still empty once the server has answered and the invalidated marks
    // query has come back agreeing.
    gate.resolve(null);
    await waitFor(() =>
      expect(spy.mock.calls.filter(isMarkedQuery).length).toBeGreaterThan(1),
    );
    expect(screen.getByTestId("heart-s1")).toHaveTextContent("empty");
  });

  it("sends a signed-out reader to sign in rather than firing", async () => {
    const { spy } = installFakeServer();
    session.data = null;
    const user = userEvent.setup();

    const { router } = renderCards(<TwentyFourCards />);
    await user.click(
      await screen.findByRole("button", { name: "untick every list for s1" }),
    );

    await waitFor(() => expect(router.state.location.pathname).toBe("/sign-in"));
    expect(router.state.location.search).toEqual({ next: "/" });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("useFavouriteMarks", () => {
  it("asks nothing when the page has no cards on it", async () => {
    // `enabled: ids.length > 0` — an empty page's answer is already known,
    // and the round trip buys nothing. Same guard the projection behind this
    // field makes on the server.
    const { spy } = installFakeServer();

    renderCards(<EmptyPage />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByTestId("heart-none")).toHaveTextContent("empty");
    expect(spy).not.toHaveBeenCalled();
  });

  it("treats the same page of cards in a different order as one cache entry", async () => {
    // The query key sorts the ids, so a listing re-sorted by price is the
    // same question and must not cost a second round trip.
    const { spy } = installFakeServer(["s3"]);

    renderCards(<TwoOrderingsOfTheSamePage />);
    await waitFor(() => expect(screen.getByTestId("heart-s3")).toHaveTextContent("filled"));

    // Both readings see the one answer, and it cost one call.
    expect(screen.getByTestId("heart-s3-reversed")).toHaveTextContent("filled");
    expect(spy.mock.calls.filter(isMarkedQuery)).toHaveLength(1);
  });
});
