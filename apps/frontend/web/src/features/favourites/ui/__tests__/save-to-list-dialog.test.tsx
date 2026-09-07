import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { FavouriteList } from "@/features/favourites/domain/types";
import * as client from "@/shared/lib/graphql/session-graphql";
import { SaveToListDialog } from "../save-to-list-dialog";

/**
 * The session, swapped per test — mocked at `@/shared/hooks/use-session`, the
 * one-line re-export, rather than at `@/shared/lib/api/auth-client`, which
 * also exports the `API_BASE_URL` that `session-graphql.ts` itself imports.
 * Same seam `favourite-button.test.tsx` picks, for the same reason.
 */
const session = vi.hoisted(() => ({ data: null as { user: { id: string } } | null }));
vi.mock("@/shared/hooks/use-session", () => ({
  useSession: () => ({ data: session.data }),
}));

const SIGNED_IN = { user: { id: "u1" } };

/** The default list: `name` is null on the wire and translated on this side. */
const FAVOURITES: FavouriteList = {
  id: "l-default",
  name: null,
  isDefault: true,
  itemCount: 12,
  coverUrls: ["one.jpg", "two.jpg", "three.jpg"],
};
const CASA: FavouriteList = {
  id: "l-casa",
  name: "Casa nova",
  isDefault: false,
  itemCount: 2,
  coverUrls: ["four.jpg", "five.jpg"],
};
const URGENTE: FavouriteList = {
  id: "l-urgente",
  name: "Urgente",
  isDefault: false,
  itemCount: 0,
  coverUrls: [],
};

const THREE_LISTS = [FAVOURITES, CASA, URGENTE];
const SEVEN_LISTS: FavouriteList[] = [
  ...THREE_LISTS,
  ...["Praia", "Escritório", "Aniversário", "Obras"].map((name, index) => ({
    id: `l-${index}`,
    name,
    isDefault: false,
    itemCount: 1,
    coverUrls: [],
  })),
];

const LISTING = {
  imageUrl: null,
  name: "Urgent electrical fault",
  byline: "Electro Sommerschield",
  price: "2 500 MZN",
};

/**
 * A fake server that answers the four documents this dialog can send, and
 * refuses anything else by name.
 *
 * A spy on the transport rather than mocked viewmodel hooks: what the dialog
 * has to get right is *what it sends* — the whole membership on every tick,
 * an empty array for the unsave, and no second question when the heart
 * already answered one — and a mocked hook asserting it was called is a test
 * of the mock.
 */
function installFakeServer(options: { lists?: FavouriteList[]; listsFor?: string[] } = {}) {
  const lists = [...(options.lists ?? THREE_LISTS)];
  let membership = options.listsFor ?? [];

  return vi.spyOn(client, "sessionGraphql").mockImplementation(async (query, variables) => {
    const text = String(query);
    const input = (variables?.input ?? {}) as { listIds?: string[]; name?: string };

    if (text.includes("favouriteListMine")) return { favouriteListMine: lists } as never;
    if (text.includes("favouriteListsFor")) return { favouriteListsFor: membership } as never;
    if (text.includes("favouriteSetLists")) {
      membership = input.listIds ?? [];
      return { favouriteSetLists: { listIds: membership } } as never;
    }
    if (text.includes("favouriteListCreate")) {
      const created = {
        id: `l-new-${lists.length}`,
        name: input.name ?? "",
        isDefault: false,
        itemCount: 0,
        coverUrls: [],
      };
      lists.push(created);
      return { favouriteListCreate: { id: created.id } } as never;
    }
    throw new Error(`the dialog sent something this fake server does not answer: ${text}`);
  });
}

type Spy = ReturnType<typeof installFakeServer>;

const sentDocuments = (spy: Spy, field: string) =>
  spy.mock.calls.filter(([query]) => String(query).includes(field));

/** The membership each `favouriteSetLists` was sent with, in order. */
const savedMemberships = (spy: Spy): string[][] =>
  sentDocuments(spy, "favouriteSetLists").map(
    ([, variables]) => (variables as { input: { listIds: string[] } }).input.listIds,
  );

/**
 * The heart and the dialog it opens, with the dialog's open state where the
 * page really holds it.
 *
 * The button stands in for `FavouriteButton`: what matters to these tests is
 * that focus was on a control before the dialog opened, so the return of
 * focus on Escape can be asserted against the thing the reader was on.
 */
function Harness({
  savedListIds,
  startOpen = true,
}: {
  savedListIds?: string[];
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Saved
      </button>
      {open && (
        <SaveToListDialog
          open
          onOpenChange={setOpen}
          targetType="service"
          targetId="s1"
          listing={LISTING}
          {...(savedListIds ? { savedListIds } : {})}
        />
      )}
    </>
  );
}

/** The harness inside a router and a `QueryClient`, which every write hook needs. */
function renderDialog(props: { savedListIds?: string[]; startOpen?: boolean } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <Harness {...props} />,
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

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

/** One turn of the loop, so anything that was going to fire has fired. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const tickBox = (name: RegExp) => screen.getByRole("checkbox", { name });

beforeEach(() => {
  session.data = SIGNED_IN;
});

afterEach(() => {
  vi.restoreAllMocks();
  session.data = null;
});

describe("SaveToListDialog", () => {
  it("says the listing is already saved, rather than asking permission", async () => {
    // Save first, ask afterwards. The dialog's job is filing, not consent —
    // so the note is in the past tense and there is nothing to cancel.
    installFakeServer();
    renderDialog({ savedListIds: ["l-default"] });

    expect(await screen.findByText("Saved in Favourites")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
  });

  it("ticks the lists the listing is already in", async () => {
    installFakeServer();
    renderDialog({ savedListIds: ["l-default", "l-casa"] });

    await screen.findByRole("checkbox", { name: /Favourites/ });
    expect(tickBox(/Favourites/)).toBeChecked();
    expect(tickBox(/Casa nova/)).toBeChecked();
    expect(tickBox(/Urgente/)).not.toBeChecked();
  });

  it("lets one listing be in two lists at once", async () => {
    // Checkboxes, not radios: "Casa nova" and "Urgente" are both true about
    // the same electrician, and making somebody choose loses one of them.
    installFakeServer();
    renderDialog({ savedListIds: ["l-default"] });

    await screen.findByRole("checkbox", { name: /Favourites/ });
    expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(1);
  });

  it("names the default list in the reader's language", async () => {
    // The server stores null for it on purpose; `listDisplayName` is the one
    // place that null turns into a word.
    installFakeServer();
    renderDialog({ savedListIds: ["l-default"] });

    expect(await screen.findByRole("checkbox", { name: /Favourites/ })).toBeInTheDocument();
  });

  it("says how many things each list already holds, and which are empty", async () => {
    installFakeServer();
    renderDialog({ savedListIds: ["l-default"] });

    expect(await screen.findByText("12 items")).toBeInTheDocument();
    expect(screen.getByText("2 items")).toBeInTheDocument();
    expect(screen.getByText("Empty")).toBeInTheDocument();
  });

  it("says which listing is being saved", async () => {
    // The dialog can be opened from a grid of twenty-four cards. Without the
    // name, nothing on screen says which one it is about.
    installFakeServer();
    renderDialog({ savedListIds: ["l-default"] });

    expect(await screen.findByText("Urgent electrical fault")).toBeInTheDocument();
    expect(screen.getByText("2 500 MZN")).toBeInTheDocument();
  });

  it("hides the search field until there are enough lists to search", async () => {
    // A search box over three rows is a control with nothing to do.
    installFakeServer();
    renderDialog({ savedListIds: ["l-default"] });

    await screen.findByRole("checkbox", { name: /Favourites/ });
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("offers the search field once the column is longer than the eye can scan", async () => {
    installFakeServer({ lists: SEVEN_LISTS });
    renderDialog({ savedListIds: ["l-default"] });

    expect(await screen.findByRole("searchbox")).toBeInTheDocument();
  });

  it("narrows the rows to the lists whose names match", async () => {
    installFakeServer({ lists: SEVEN_LISTS });
    renderDialog({ savedListIds: ["l-default"] });

    fireEvent.change(await screen.findByRole("searchbox"), { target: { value: "casa" } });

    expect(tickBox(/Casa nova/)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /Urgente/ })).not.toBeInTheDocument();
  });

  it("files the listing the moment a list is ticked, rather than waiting for Done", async () => {
    // The dialog files; Done only closes it. A membership that landed only on
    // Done would be lost by a reader who closed with Escape.
    const spy = installFakeServer();
    renderDialog({ savedListIds: ["l-default"] });

    fireEvent.click(await screen.findByRole("checkbox", { name: /Casa nova/ }));

    await waitFor(() => expect(savedMemberships(spy)).toHaveLength(1));
    // The whole desired membership, never an add/remove pair — see `useSetLists`.
    expect(savedMemberships(spy)[0]).toEqual(["l-default", "l-casa"]);
  });

  it("warns before unticking the last list, because that unsaves it", async () => {
    // Unticking everything is the delete, and it does not look like one, so
    // the footer says what just happened rather than asking "are you sure"
    // about a thing already done.
    installFakeServer();
    renderDialog({ savedListIds: ["l-default"] });

    fireEvent.click(await screen.findByRole("checkbox", { name: /Favourites/ }));

    expect(await screen.findByText(/no longer saved/i)).toBeInTheDocument();
  });

  it("sends an empty membership when the last list comes off — that is the delete", async () => {
    const spy = installFakeServer();
    renderDialog({ savedListIds: ["l-default"] });

    fireEvent.click(await screen.findByRole("checkbox", { name: /Favourites/ }));

    await waitFor(() => expect(savedMemberships(spy)).toHaveLength(1));
    expect(savedMemberships(spy)[0]).toEqual([]);
  });

  it("creates a list inline rather than opening a second dialog", async () => {
    // A modal over a modal hides the thing being saved behind the thing
    // deciding where to put it.
    installFakeServer();
    renderDialog({ savedListIds: ["l-default"] });

    fireEvent.click(await screen.findByRole("button", { name: "Create new list" }));

    expect(screen.getByRole("textbox", { name: /list name/i })).toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    // The lists it is about to join stay on screen underneath it.
    expect(tickBox(/Favourites/)).toBeInTheDocument();
  });

  it("ticks a list it has just created, because that is why it was created", async () => {
    const spy = installFakeServer();
    renderDialog({ savedListIds: ["l-default"] });

    fireEvent.click(await screen.findByRole("button", { name: "Create new list" }));
    fireEvent.change(screen.getByRole("textbox", { name: /list name/i }), {
      target: { value: "Aniversário da Nara" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    const created = await screen.findByRole("checkbox", { name: /Aniversário da Nara/ });
    expect(created).toBeChecked();
    // And the listing is actually in it: a tick that files nothing is a lie.
    await waitFor(() => expect(savedMemberships(spy)).toHaveLength(1));
    expect(savedMemberships(spy)[0]).toEqual(["l-default", "l-new-3"]);
  });

  it("refuses to create a list with no name", async () => {
    // The server bounds the name at 1..60 characters and answers
    // VALIDATION_ERROR outside it. Stopping here is cheaper than a round trip
    // whose only outcome is a refusal.
    const spy = installFakeServer();
    renderDialog({ savedListIds: ["l-default"] });

    fireEvent.click(await screen.findByRole("button", { name: "Create new list" }));
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await settle();

    expect(sentDocuments(spy, "favouriteListCreate")).toHaveLength(0);
  });

  it("asks nobody which lists hold the listing when the heart already answered", async () => {
    // `favouriteQuickSave` returns the membership precisely so the dialog can
    // open knowing it. A second round trip would be a spinner for nothing.
    const spy = installFakeServer();
    renderDialog({ savedListIds: ["l-default"] });

    await screen.findByRole("checkbox", { name: /Favourites/ });
    await settle();

    expect(sentDocuments(spy, "favouriteListsFor")).toHaveLength(0);
  });

  it("asks which lists hold the listing when the heart could not say", async () => {
    // A press on an already-filled heart saved nothing, so it knows nothing.
    // The dialog asks rather than guessing at an empty membership, which is
    // the one thing a filled heart cannot mean.
    const spy = installFakeServer({ listsFor: ["l-casa"] });
    renderDialog();

    await waitFor(() => expect(tickBox(/Casa nova/)).toBeChecked());
    expect(sentDocuments(spy, "favouriteListsFor")).toHaveLength(1);
    expect(tickBox(/Favourites/)).not.toBeChecked();
  });

  it("closes on Escape and returns focus to the heart", async () => {
    // Standard dialog behaviour, and the heart is where the reader was: a
    // dialog that leaves focus behind it drops a keyboard reader at the top
    // of the page they were half way down.
    installFakeServer();
    renderDialog({ startOpen: false });

    const heart = await screen.findByRole("button", { name: "Saved" });
    heart.focus();
    fireEvent.click(heart);
    await screen.findByRole("checkbox", { name: /Favourites/ });

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(document.activeElement).toBe(heart);
  });

  it("keeps focus inside itself while it is open", async () => {
    // `aria-modal` claims the page behind is unreachable; a Tab that walks
    // back out to the heart makes that claim false. Shift+Tab off the first
    // control is the direction that leaves, so it is the one asserted.
    installFakeServer();
    renderDialog({ startOpen: false });

    fireEvent.click(await screen.findByRole("button", { name: "Saved" }));
    const dialog = await screen.findByRole("dialog");

    const first = document.activeElement;
    expect(dialog.contains(first)).toBe(true);

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });

    expect(document.activeElement).not.toBe(first);
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("names itself, so it is not an unnamed panel over the page", async () => {
    installFakeServer();
    renderDialog({ savedListIds: ["l-default"] });

    expect(await screen.findByRole("dialog", { name: "Save to a list" })).toBeInTheDocument();
  });

  describe("on a phone", () => {
    /**
     * The suite's `matchMedia` stub answers "no query matches", which resolves
     * `useIsMobile()` to the wide layout. A test that means to assert the
     * sheet has to say so, rather than inheriting a breakpoint it never chose.
     */
    const wide = window.matchMedia;

    beforeEach(() => {
      window.matchMedia = ((query: string) =>
        ({
          matches: true,
          media: query,
          onchange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList) as typeof window.matchMedia;
    });

    // Put back, so a phone stays something a test opts into rather than
    // something the file's last describe leaves behind.
    afterEach(() => {
      window.matchMedia = wide;
    });

    it("drops the photograph and lets the name and the price identify the listing", async () => {
      // The two-panel dialog does not fit, and the photograph is the first
      // thing to go — so the subtitle has to carry the identification.
      installFakeServer();
      renderDialog({ savedListIds: ["l-default"] });

      expect(
        await screen.findByText("Urgent electrical fault · 2 500 MZN"),
      ).toBeInTheDocument();
      expect(screen.queryByTestId("media-fallback")).not.toBeInTheDocument();
    });

    it("is still the same list of lists, with the same ticks", async () => {
      installFakeServer();
      renderDialog({ savedListIds: ["l-default", "l-casa"] });

      await screen.findByRole("checkbox", { name: /Favourites/ });
      expect(tickBox(/Favourites/)).toBeChecked();
      expect(tickBox(/Casa nova/)).toBeChecked();
      expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
    });
  });
});
