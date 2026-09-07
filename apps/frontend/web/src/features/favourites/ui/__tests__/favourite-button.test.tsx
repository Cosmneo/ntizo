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
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as client from "@/shared/lib/graphql/session-graphql";
import { FavouriteButton } from "../favourite-button";

/**
 * The session, swapped per test — mocked at `@/shared/hooks/use-session`, the
 * one-line re-export, rather than at `@/shared/lib/api/auth-client`, which
 * also exports the `API_BASE_URL` that `session-graphql.ts` itself imports.
 * Replacing the whole auth module would quietly replace that too. Same seam
 * `use-quick-save.test.tsx` picks, for the same reason.
 */
const session = vi.hoisted(() => ({ data: null as { user: { id: string } } | null }));
vi.mock("@/shared/hooks/use-session", () => ({
  useSession: () => ({ data: session.data }),
}));

const SIGNED_IN = { user: { id: "u1" } };

/**
 * A fake server that answers the two documents this button can send, and
 * refuses anything else by name.
 *
 * A real spy on the transport rather than a mocked `useQuickSave`: what this
 * button has to get right is *whether a save is sent at all* — a filled heart
 * must not send one — and a mocked hook asserting it was not called is a test
 * of the mock. The spy sees the wire.
 */
function installFakeServer(marked: string[] = []) {
  const saved = new Set(marked);
  const spy = vi
    .spyOn(client, "sessionGraphql")
    .mockImplementation(async (query, variables) => {
      const text = String(query);
      const input = (variables?.input ?? {}) as { targetId?: string };

      if (text.includes("favouriteMarked")) {
        return { favouriteMarked: [...saved] } as never;
      }
      if (text.includes("favouriteQuickSave")) {
        saved.add(input.targetId!);
        return { favouriteQuickSave: { listIds: ["l-default", "l-casa"] } } as never;
      }
      throw new Error(`the heart sent something this fake server does not answer: ${text}`);
    });

  return spy;
}

const quickSaves = (spy: ReturnType<typeof installFakeServer>) =>
  spy.mock.calls.filter(([query]) => String(query).includes("favouriteQuickSave"));

/**
 * The button inside a router and a `QueryClient`, with the real `/sign-in`
 * route registered — so a signed-out press is asserted against the router's
 * own resolved location rather than against a mocked `navigate` call, which
 * passes even when the `to`/`search` shape is wrong.
 */
function renderButton(ui: ReactNode) {
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

/** One turn of the loop, so anything that was going to fire has fired. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  session.data = SIGNED_IN;
});

afterEach(() => {
  vi.restoreAllMocks();
  session.data = null;
});

describe("FavouriteButton", () => {
  it("says what pressing it will do, not what the icon looks like", async () => {
    installFakeServer();
    renderButton(<FavouriteButton targetType="service" targetId="s1" saved={false} />);

    expect(await screen.findByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("changes its own name once it is saved", async () => {
    // One control with two meanings. A label that stays "Save" on a filled
    // heart tells a screen-reader user the opposite of the truth.
    installFakeServer();
    renderButton(<FavouriteButton targetType="service" targetId="s1" saved />);

    expect(await screen.findByRole("button", { name: "Saved" })).toBeInTheDocument();
  });

  it("carries aria-pressed, so the state is not only a colour", async () => {
    // The design accepts that navy is quieter than the red a saved heart
    // wears elsewhere on the web. What pays for that is this: the state is
    // announced, not merely painted.
    installFakeServer();
    renderButton(<FavouriteButton targetType="service" targetId="s1" saved />);

    expect(await screen.findByRole("button")).toHaveAttribute("aria-pressed", "true");
  });

  it("says it opens a dialog as well as toggling, because it does both", async () => {
    // `aria-pressed` alone promises a toggle this button does not perform:
    // activating a saved heart opens the save-to-a-list dialog rather than
    // unpressing anything. `aria-haspopup` is what completes the promise.
    installFakeServer();
    renderButton(<FavouriteButton targetType="service" targetId="s1" saved onSaved={vi.fn()} />);

    expect(await screen.findByRole("button")).toHaveAttribute("aria-haspopup", "dialog");
  });

  it("says a save is still out, without redrawing the heart that already answered", async () => {
    // The optimistic fill is the answer to the press; what it cannot say is
    // that the round trip — and the dialog behind it — is still in flight.
    // A spinner would take the certain answer away to say so.
    let answer: (value: unknown) => void = () => {};
    vi.spyOn(client, "sessionGraphql").mockImplementation((query) =>
      String(query).includes("favouriteQuickSave")
        ? new Promise((resolve) => {
            answer = resolve;
          })
        : Promise.resolve({ favouriteMarked: [] } as never),
    );

    renderButton(<FavouriteButton targetType="service" targetId="s1" saved={false} />);
    const heart = await screen.findByRole("button", { name: "Save" });
    expect(heart).toHaveAttribute("aria-busy", "false");

    fireEvent.click(heart);
    await waitFor(() => expect(heart).toHaveAttribute("aria-busy", "true"));

    await act(async () => {
      answer({ favouriteQuickSave: { listIds: ["l-default"] } });
    });
    await waitFor(() => expect(heart).toHaveAttribute("aria-busy", "false"));
  });

  it("is not pressed when the listing is not saved", async () => {
    installFakeServer();
    renderButton(<FavouriteButton targetType="service" targetId="s1" saved={false} />);

    expect(await screen.findByRole("button")).toHaveAttribute("aria-pressed", "false");
  });

  it("is still rendered when signed out", async () => {
    // Hiding it teaches nobody the feature exists.
    installFakeServer();
    session.data = null;
    renderButton(<FavouriteButton targetType="service" targetId="s1" saved={false} />);

    expect(await screen.findByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("sends a signed-out reader to sign in, carrying the way back, instead of saving", async () => {
    // Every favourites field refuses an anonymous caller, so an anonymous
    // save is a round trip whose only outcome is a refusal. `next` carries
    // the page they were saving from.
    const spy = installFakeServer();
    session.data = null;

    const { router } = renderButton(
      <FavouriteButton targetType="service" targetId="s1" saved={false} />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/sign-in"));
    expect(router.state.location.search).toEqual({ next: "/" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("does not open the result it sits on", async () => {
    // The title link is an `::after` spanning the whole tile, so the heart is
    // a control standing inside another control's target. Both calls are
    // needed and both are asserted here: `stopPropagation` keeps the click
    // off any anchor above it, and `preventDefault` cancels the default
    // action of the press itself.
    installFakeServer();
    const onNavigate = vi.fn();

    renderButton(
      <a href="/services/s1" onClick={onNavigate}>
        <FavouriteButton targetType="service" targetId="s1" saved={false} />
      </a>,
    );

    const cancelled = !fireEvent.click(await screen.findByRole("button", { name: "Save" }));

    expect(onNavigate).not.toHaveBeenCalled();
    expect(cancelled).toBe(true);
  });

  it("hands the dialog the lists the save came back with, so it need not ask again", async () => {
    // `favouriteQuickSave` already answered with them. A second round trip to
    // fill a dialog the reader is already looking at is a spinner for nothing.
    installFakeServer();
    const onSaved = vi.fn();

    renderButton(
      <FavouriteButton
        targetType="service"
        targetId="s1"
        saved={false}
        onSaved={onSaved}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(onSaved).toHaveBeenCalledWith({ listIds: ["l-default", "l-casa"] }),
    );
  });

  it("saves the listing it was given, under the type it was given", async () => {
    // A service and a provider may legitimately share an id, so the type
    // rides along on every write.
    const spy = installFakeServer();

    renderButton(<FavouriteButton targetType="provider" targetId="p7" saved={false} />);
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));

    await waitFor(() => expect(quickSaves(spy)).toHaveLength(1));
    expect(quickSaves(spy)[0]![1]).toEqual({
      input: { targetType: "provider", targetId: "p7" },
    });
  });

  it("does not re-save a listing that is already saved", async () => {
    // Pressing a filled heart opens the dialog. Removing is unticking every
    // list there, not a second meaning for the same button.
    const spy = installFakeServer(["s1"]);
    const onSaved = vi.fn();

    renderButton(
      <FavouriteButton targetType="service" targetId="s1" saved onSaved={onSaved} />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Saved" }));
    await settle();

    expect(quickSaves(spy)).toHaveLength(0);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("tells the dialog nothing about lists it has not been told, on a filled heart", async () => {
    // The press that saves knows the answer; the press on an already-filled
    // heart does not, and must not invent one — the dialog asks for itself.
    installFakeServer(["s1"]);
    const onSaved = vi.fn();

    renderButton(
      <FavouriteButton targetType="service" targetId="s1" saved onSaved={onSaved} />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Saved" }));
    await settle();

    expect(onSaved).toHaveBeenCalledWith({});
  });

  it("asks nobody anything until it is pressed", async () => {
    // The marks come from one query in the page. A heart that fetched for
    // itself would be one request per tile, twenty-four to a page.
    const spy = installFakeServer();

    renderButton(<FavouriteButton targetType="service" targetId="s1" saved={false} />);
    await settle();

    expect(spy).not.toHaveBeenCalled();
  });
});
