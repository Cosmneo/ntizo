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
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
function installFakeServer(
  options: {
    lists?: FavouriteList[];
    listsFor?: string[];
    /**
     * Holds `favouriteListsFor` open until the test releases it — the window
     * in which the dialog knows the listing is saved but not where. It is the
     * ordinary case on a filled-heart press, since the lists are cached and
     * this question never is.
     */
    hold?: { release: () => void };
    /** Refuses `favouriteListsFor`, so the membership never arrives at all. */
    refuseListsFor?: boolean;
    /**
     * Flipped by the test *after* a first answer has landed, so every later
     * `favouriteListsFor` refuses. That is a failed **refetch**, not a failed
     * load: every write invalidates the whole `["favourites"]` prefix, so this
     * query is asked again after each tick, and TanStack answers `error` while
     * keeping the membership it already has.
     */
    breakListsFor?: { now: boolean };
    /** Refuses `favouriteSetLists`, so the one write a reader watches fails. */
    refuseSetLists?: boolean;
  } = {},
) {
  const lists = [...(options.lists ?? THREE_LISTS)];
  let membership = options.listsFor ?? [];

  const held = new Promise<void>((resolve) => {
    if (options.hold) options.hold.release = resolve;
  });

  return vi.spyOn(client, "sessionGraphql").mockImplementation(async (query, variables) => {
    const text = String(query);
    const input = (variables?.input ?? {}) as { listIds?: string[]; name?: string };

    if (text.includes("favouriteListMine")) return { favouriteListMine: lists } as never;
    if (text.includes("favouriteListsFor")) {
      if (options.refuseListsFor || options.breakListsFor?.now) throw new Error("UNAUTHENTICATED");
      if (options.hold) await held;
      return { favouriteListsFor: membership } as never;
    }
    if (text.includes("favouriteSetLists")) {
      if (options.refuseSetLists) throw new Error("the network went away mid-tick");
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

  it("shows a list it has just created, even under a filter that excludes it", async () => {
    // The filter goes with the creation. Otherwise the list is created,
    // ticked and filed, and never appears — `shown` still excludes it — so
    // the reader's own answer to "none of these" vanishes as they make it.
    installFakeServer({ lists: SEVEN_LISTS });
    renderDialog({ savedListIds: ["l-default"] });

    const box = await screen.findByRole("searchbox");
    fireEvent.change(box, { target: { value: "zzz" } });
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Create new list" }));
    fireEvent.change(screen.getByRole("textbox", { name: /list name/i }), {
      target: { value: "Casa da praia" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByRole("checkbox", { name: /Casa da praia/ })).toBeChecked();
    expect(box).toHaveValue("");
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

  it("does not also tell the reader to untick everything once they have", async () => {
    // The footer owns that sentence, and owns it where the reader is looking
    // when they finish. The header printing "untick every list" over a
    // listing already in no list is the same frame saying two opposite
    // things — the state every removal passes through.
    installFakeServer();
    renderDialog({ savedListIds: ["l-default"] });

    fireEvent.click(await screen.findByRole("checkbox", { name: /Favourites/ }));

    expect(await screen.findByText(/no longer saved/i)).toBeInTheDocument();
    expect(screen.queryByText(/untick every list/i)).not.toBeInTheDocument();
    // The slot stays, so the panel does not jump a line shorter — and it is
    // the same live region, now with nothing to announce.
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("says so when the write is refused, rather than leaving the tick and the heart to disagree", async () => {
    // The marks cache rolls back on a refusal, so the heart behind the dialog
    // empties while the box the reader pressed stays ticked. Without a word
    // between them, the two simply disagree.
    installFakeServer({ refuseSetLists: true });
    renderDialog({ savedListIds: ["l-default"] });

    fireEvent.click(await screen.findByRole("checkbox", { name: /Casa nova/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't save that change. Try again in a moment.",
    );
  });

  describe("when a tick's own invalidation re-asks which lists hold it", () => {
    /**
     * Every write invalidates the whole `["favourites"]` prefix, so on the
     * filled-heart path `listsFor` is refetched after each tick — and a
     * refetch can fail while the membership it already fetched is still
     * perfectly good. TanStack keeps the data and flips the status, so a
     * dialog reading "failed" alone apologises over ticks it knows.
     */
    it("keeps the membership it already has when the refetch fails", async () => {
      const breakListsFor = { now: false };
      installFakeServer({ listsFor: ["l-casa"], breakListsFor });
      renderDialog();

      await waitFor(() => expect(tickBox(/Casa nova/)).toBeChecked());
      expect(await screen.findByText("Saved in Casa nova")).toBeInTheDocument();

      breakListsFor.now = true;
      fireEvent.click(tickBox(/Urgente/));
      await settle();

      expect(screen.getByText("Saved in Casa nova")).toBeInTheDocument();
      expect(
        screen.queryByText("We couldn't check which lists this is in right now."),
      ).not.toBeInTheDocument();
      expect(tickBox(/Urgente/)).toBeChecked();
    });

    it("never says both that it cannot check the lists and that they are empty", async () => {
      // The two sentences are independent branches, so an ungated apology and
      // the footer's "No longer saved." can be on screen at once, one frame
      // apart in meaning: the header claiming it knows nothing over a footer
      // reporting exactly what it knows.
      const breakListsFor = { now: false };
      installFakeServer({ listsFor: ["l-casa"], breakListsFor });
      renderDialog();

      await waitFor(() => expect(tickBox(/Casa nova/)).toBeChecked());

      breakListsFor.now = true;
      fireEvent.click(tickBox(/Casa nova/));
      await settle();

      expect(screen.getByText(/no longer saved/i)).toBeInTheDocument();
      expect(
        screen.queryByText("We couldn't check which lists this is in right now."),
      ).not.toBeInTheDocument();
    });
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

  it("drops a half-typed list name on Escape, and keeps the dialog open", async () => {
    // Escape in a field means "abandon what I am typing". Letting it through
    // to the dialog's own Escape would close the whole thing and lose both
    // the name and the place the reader was filing from.
    installFakeServer();
    renderDialog({ savedListIds: ["l-default"] });

    fireEvent.click(await screen.findByRole("button", { name: "Create new list" }));
    const field = screen.getByRole("textbox", { name: /list name/i });
    fireEvent.change(field, { target: { value: "Casa da praia" } });
    fireEvent.keyDown(field, { key: "Escape" });

    expect(screen.queryByRole("textbox", { name: /list name/i })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(tickBox(/Favourites/)).toBeInTheDocument();
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

  describe("while nobody yet knows which lists hold it", () => {
    it("never writes a membership built out of the answer it is waiting for", async () => {
      // The failure this window causes if `undefined` is read as `[]`: a tick
      // sends `setLists(target, [thatOne])` and silently drops every other
      // list the listing was in. Nothing may be written until the answer is
      // in hand, and then the write carries the lot.
      const hold = { release: () => {} };
      const spy = installFakeServer({ listsFor: ["l-casa"], hold });
      renderDialog();

      const casa = await screen.findByRole("checkbox", { name: /Casa nova/ });
      expect(casa).toBeDisabled();
      fireEvent.click(casa);
      fireEvent.click(screen.getByRole("checkbox", { name: /Urgente/ }));
      await settle();
      expect(savedMemberships(spy)).toHaveLength(0);

      hold.release();
      await waitFor(() => expect(tickBox(/Casa nova/)).toBeChecked());

      fireEvent.click(tickBox(/Urgente/));
      await waitFor(() => expect(savedMemberships(spy)).toHaveLength(1));
      expect(savedMemberships(spy)[0]).toEqual(["l-casa", "l-urgente"]);
    });

    it("does not tell a saved listing it is no longer saved", async () => {
      // Every row is unticked in this window because the answer has not
      // arrived — not because the listing is in no list. The footer's
      // sentence is a claim this dialog cannot make yet.
      const hold = { release: () => {} };
      installFakeServer({ listsFor: ["l-casa"], hold });
      renderDialog();

      await screen.findByRole("checkbox", { name: /Casa nova/ });
      expect(screen.queryByText(/no longer saved/i)).not.toBeInTheDocument();
      // What it does say is the one thing the filled heart already proved.
      // Scoped to the dialog: the harness's own heart is labelled "Saved".
      expect(within(screen.getByRole("dialog")).getByText("Saved")).toBeInTheDocument();

      hold.release();
      await waitFor(() => expect(screen.getByText("Saved in Casa nova")).toBeInTheDocument());
    });

    it("offers no new list either, since it would be filed into the same empty guess", async () => {
      const hold = { release: () => {} };
      installFakeServer({ listsFor: ["l-casa"], hold });
      renderDialog();

      await screen.findByRole("checkbox", { name: /Casa nova/ });
      expect(screen.getByRole("button", { name: "Create new list" })).toBeDisabled();

      hold.release();
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Create new list" })).toBeEnabled(),
      );
    });

    it("says so, and stays inert, when the question is refused outright", async () => {
      // A refused query never resolves into a membership, so the window is
      // permanent. Saying nothing would leave a dialog whose boxes cannot be
      // pressed and whose reader is told nothing about why.
      const spy = installFakeServer({ refuseListsFor: true });
      renderDialog();

      expect(
        await screen.findByText("We couldn't check which lists this is in right now."),
      ).toBeInTheDocument();
      fireEvent.click(tickBox(/Casa nova/));
      await settle();

      expect(savedMemberships(spy)).toHaveLength(0);
      expect(screen.queryByText(/no longer saved/i)).not.toBeInTheDocument();
      // Done still closes it — the reader is not trapped by a failed question.
      expect(screen.getByRole("button", { name: "Done" })).toBeEnabled();
    });
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
    renderDialog({ savedListIds: ["l-default"], startOpen: false });

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
