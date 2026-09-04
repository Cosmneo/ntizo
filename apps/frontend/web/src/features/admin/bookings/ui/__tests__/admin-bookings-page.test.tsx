import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { ADMIN_BOOKING_TABS, type AdminBookingTab } from "@ntizo/shared/read-models";
import i18n from "@/shared/lib/i18n";
import type { AdminBookingRowDTO } from "../../data/admin-booking.repository";
import { AdminBookingsPage } from "../admin-bookings-page";

/**
 * The network is the seam, and it is the only one.
 *
 * `sessionGraphql` rather than the repository or the hook, for the reason
 * `provider/bookings/ui/__tests__/bookings-page.test.tsx` gives: everything
 * between the page and the wire — the query key, the tab that reaches the
 * input, the mutation documents, the booking id each one carries — is this
 * feature's own, and a mocked hook handed a ready-made page asserts none of
 * it. `vi.mock` names a module rather than importing one, so no `ui -> data`
 * edge is created and the boundaries policy is untouched.
 */
const fakes = vi.hoisted(() => ({ graphql: vi.fn() }));

vi.mock("@/shared/lib/graphql/session-graphql", () => ({
  sessionGraphql: fakes.graphql,
}));

/**
 * The same validator the real route carries, duplicated rather than imported:
 * `src/routes/**` is the `routes` element and a `ui` file may not import one,
 * test files included. What matters is that the harness rejects the same
 * values the address bar does, or "the tab is in the URL" would be a claim
 * about this file's leniency.
 */
function validateSearch(search: Record<string, unknown>): {
  tab?: AdminBookingTab;
  offset?: number;
} {
  const tab = search["tab"];
  const offset = Number(search["offset"]);
  return {
    tab:
      typeof tab === "string" && (ADMIN_BOOKING_TABS as readonly string[]).includes(tab)
        ? (tab as AdminBookingTab)
        : undefined,
    offset: Number.isSafeInteger(offset) && offset > 0 ? offset : undefined,
  };
}

/** Two days and a bit ago, so "2 dias" is the answer for any run. */
function twoDaysAgo(): string {
  return new Date(Date.now() - (2 * 24 + 3) * 60 * 60_000).toISOString();
}

function rowFixture(over: Partial<AdminBookingRowDTO> = {}): AdminBookingRowDTO {
  return {
    id: "bk-1",
    status: "CONFIRMED",
    providerId: "prov-1",
    providerName: "Estúdio Mavalane",
    customerFirstName: "Ana",
    serviceName: "Corte de cabelo",
    startsAt: "2026-09-01T09:00:00.000Z",
    endsAt: twoDaysAgo(),
    timezone: "Africa/Maputo",
    markedDoneAt: null,
    threadId: null,
    ...over,
  };
}

const DISPUTED_ROW = rowFixture({
  id: "bk-9",
  status: "DISPUTED",
  providerName: "Salão Polana",
  customerFirstName: "Bruno",
  serviceName: "Manicure",
  markedDoneAt: twoDaysAgo(),
  threadId: "th-9",
});

const MARKED_DONE_ROW = rowFixture({
  id: "bk-5",
  status: "MARKED_DONE",
  customerFirstName: "Carla",
  markedDoneAt: twoDaysAgo(),
});

type Page = { items: AdminBookingRowDTO[]; total: number; nextOffset: number | null };

const page = (items: AdminBookingRowDTO[], over: Partial<Page> = {}): Page => ({
  items,
  total: items.length,
  nextOffset: null,
  ...over,
});

/**
 * What the server answers with, per tab — a function, because the whole point
 * of a tab is that two of them answer differently, and a mock that answers
 * identically whatever it is handed cannot fail on anything that turns on the
 * difference.
 */
type Answer = Page | ((input: { tab: AdminBookingTab; offset: number }) => Page);

interface Options {
  answer?: Answer;
  /** Return an `Error` to have that mutation refused rather than accepted. */
  onMutation?: (field: string, input: Record<string, unknown>) => unknown;
  /**
   * Hold every mutation open until `release()` is called.
   *
   * The window between the press and the answer is the only place an
   * optimistic write would be visible — invalidating afterwards puts the
   * server's own answer back, so a page that cheated in between would look
   * identical once the dust settled. Holding the wire open is what makes that
   * window assertable.
   */
  deferMutations?: boolean;
}

function renderQueue(at: string, options: Options = {}) {
  const answer = options.answer ?? page([rowFixture()]);
  const held: (() => void)[] = [];
  fakes.graphql.mockReset();
  fakes.graphql.mockImplementation(
    (document: string, variables: { input: Record<string, unknown> }) => {
      if (document.includes("bookingNeedsAttentionForAdmin")) {
        const input = variables.input as unknown as { tab: AdminBookingTab; offset: number };
        return Promise.resolve({
          bookingNeedsAttentionForAdmin:
            typeof answer === "function" ? answer(input) : answer,
        });
      }
      const field = /mutation \w+\([^)]*\)\s*\{\s*(\w+)/.exec(document)?.[1] ?? "";
      const result = options.onMutation?.(field, variables.input);
      if (result instanceof Error) return Promise.reject(result);
      const answered = { [field]: { bookingId: variables.input["bookingId"] } };
      if (!options.deferMutations) return Promise.resolve(answered);
      return new Promise((resolve) => held.push(() => resolve(answered)));
    },
  );

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRoute();
  const queueRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/admin/bookings",
    validateSearch,
    component: AdminBookingsPage,
  });
  // Registered so the two links a row can carry are asserted against the
  // router's own resolved href rather than a `to` prop that type-checks and
  // resolves to nothing.
  const threadRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/admin/support/$threadId",
    component: () => <p>thread</p>,
  });
  const providerRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/admin/providers/$providerId",
    component: () => <p>provider</p>,
  });

  const router = createRouter({
    routeTree: rootRoute.addChildren([queueRoute, threadRoute, providerRoute]),
    history: createMemoryHistory({ initialEntries: [at] }),
  });

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return { router, queryClient, release: () => held.splice(0).forEach((r) => r()) };
}

/**
 * One row of the table, by whatever names it.
 *
 * jsdom applies no CSS, so `CollectionCard`'s two layouts — the table from
 * `md` and the stacked cards below it — are both in the document and every
 * value on a row is present twice. Naming the table's row picks one of them,
 * and asserts that the customer, the service and the wait are on the *same*
 * row rather than merely somewhere on the page.
 */
async function row(name: string) {
  const table = await screen.findByRole("table");
  const cell = await within(table).findByText(name);
  return within(cell.closest("tr")!);
}

/** Every call made to the wire so far, as `[document, variables]`. */
function sent(): [string, { input: Record<string, unknown> }][] {
  return fakes.graphql.mock.calls as [string, { input: Record<string, unknown> }][];
}

/** Every GraphQL document sent so far whose operation is a mutation. */
function mutations(): { field: string; input: Record<string, unknown> }[] {
  return sent()
    .filter(([document]) => document.trimStart().startsWith("mutation"))
    .map(([document, variables]) => ({
      field: /mutation \w+\([^)]*\)\s*\{\s*(\w+)/.exec(document)?.[1] ?? "",
      input: variables.input,
    }));
}

/** How many times the queue itself has been asked for. */
function queueReads(): number {
  return sent().filter(([document]) => document.includes("bookingNeedsAttentionForAdmin"))
    .length;
}

/**
 * The locale is pinned, not inherited: every assertion here reads Portuguese
 * copy — including the button the brief names, "Marcar como concluído" — and
 * the suite's default resolves to English (`test/setup.ts` says so).
 */
beforeEach(async () => {
  await i18n.changeLanguage("pt-MZ");
});

afterEach(async () => {
  await i18n.changeLanguage("en-US");
});

describe("AdminBookingsPage", () => {
  it("offers the three tabs the queue has, and no others", async () => {
    renderQueue("/admin/bookings");
    await row("Ana");

    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Por fechar",
      "Em janela",
      "Reclamações",
    ]);
  });

  it("shows the workspace, the customer, the service and how long it has waited", async () => {
    renderQueue("/admin/bookings");

    const ana = await row("Ana");
    // The `href`, not only the name: a link whose accessible name is the
    // workspace can still point at the booking's own id, and asserting the
    // name alone let exactly that through — `params={{ providerId: b.id }}`
    // kept the whole suite green.
    expect(ana.getByRole("link", { name: "Estúdio Mavalane" })).toHaveAttribute(
      "href",
      "/admin/providers/prov-1",
    );
    expect(ana.getByText("Corte de cabelo")).toBeInTheDocument();
    // `Intl`'s own abbreviation for the locale, which in `pt` is the whole word.
    expect(ana.getByText("à espera há 2 dias")).toBeInTheDocument();
    expect(ana.getByText("Confirmada")).toBeInTheDocument();
  });

  it("asks the server for the tab that is in the address bar", async () => {
    renderQueue("/admin/bookings?tab=disputed", { answer: page([DISPUTED_ROW]) });
    await row("Bruno");

    expect(fakes.graphql).toHaveBeenCalledWith(
      expect.stringContaining("bookingNeedsAttentionForAdmin"),
      { input: { tab: "disputed", limit: 20, offset: 0 } },
    );
  });

  it("switches tab through the URL, so a tab survives a refresh", async () => {
    const { router } = renderQueue("/admin/bookings", {
      answer: ({ tab }) => (tab === "unclosed" ? page([rowFixture()]) : page([MARKED_DONE_ROW])),
    });
    await row("Ana");

    await userEvent.click(screen.getByRole("tab", { name: "Em janela" }));

    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ tab: "in_window" }),
    );
    // The other tab's rows, not the first tab's under a new heading.
    expect((await row("Carla")).getByText("Marcada como concluída")).toBeInTheDocument();
    expect(within(await screen.findByRole("table")).queryByText("Ana")).not.toBeInTheDocument();
  });

  it("marks a booking done on the provider's behalf, with that row's id", async () => {
    renderQueue("/admin/bookings", { answer: page([rowFixture(), rowFixture({ id: "bk-2", customerFirstName: "Bruno" })]) });
    const ana = await row("Ana");

    await userEvent.click(ana.getByRole("button", { name: "Marcar como concluído" }));

    await waitFor(() =>
      expect(mutations()).toEqual([
        { field: "bookingAdminMarkDone", input: { bookingId: "bk-1" } },
      ]),
    );
  });

  it("completes a booking whose window has not run out", async () => {
    renderQueue("/admin/bookings?tab=in_window", { answer: page([MARKED_DONE_ROW]) });
    const carla = await row("Carla");

    await userEvent.click(carla.getByRole("button", { name: "Concluir agora" }));

    await waitFor(() =>
      expect(mutations()).toEqual([
        { field: "bookingAdminComplete", input: { bookingId: "bk-5" } },
      ]),
    );
  });

  it("sides with the customer when a dispute is upheld", async () => {
    renderQueue("/admin/bookings?tab=disputed", { answer: page([DISPUTED_ROW]) });
    const bruno = await row("Bruno");

    await userEvent.click(bruno.getByRole("button", { name: "Dar razão ao cliente" }));

    await waitFor(() =>
      expect(mutations()).toEqual([
        { field: "bookingResolveDispute", input: { bookingId: "bk-9", upheld: true } },
      ]),
    );
  });

  it("lets the completion stand when a dispute is turned down", async () => {
    renderQueue("/admin/bookings?tab=disputed", { answer: page([DISPUTED_ROW]) });
    const bruno = await row("Bruno");

    await userEvent.click(bruno.getByRole("button", { name: "Manter conclusão" }));

    await waitFor(() =>
      expect(mutations()).toEqual([
        { field: "bookingResolveDispute", input: { bookingId: "bk-9", upheld: false } },
      ]),
    );
  });

  it("links a disputed row to the thread the complaint lives in", async () => {
    renderQueue("/admin/bookings?tab=disputed", { answer: page([DISPUTED_ROW]) });
    const bruno = await row("Bruno");

    expect(bruno.getByRole("link", { name: "Abrir a reclamação" })).toHaveAttribute(
      "href",
      "/admin/support/th-9",
    );
  });

  it("does not offer a thread on a row that has none", async () => {
    renderQueue("/admin/bookings");
    const ana = await row("Ana");

    expect(ana.queryByRole("link", { name: "Abrir a reclamação" })).not.toBeInTheDocument();
  });

  /**
   * The trap this whole screen is built around. `bookingAdminMarkDone`
   * answers `{ bookingId }` whether it moved the row or lost the
   * compare-and-swap to the platform's own sweep, so a page that wrote the
   * new status into the cache — or printed a sentence saying the booking was
   * closed — would be asserting something the wire never told it.
   *
   * Here the refetch answers with the row exactly as it was. Nothing on
   * screen may claim otherwise.
   */
  it("claims nothing while the write is in flight", async () => {
    const { release } = renderQueue("/admin/bookings", { deferMutations: true });
    const ana = await row("Ana");

    await userEvent.click(ana.getByRole("button", { name: "Marcar como concluído" }));
    await waitFor(() => expect(mutations()).toHaveLength(1));

    // The wire has been asked and has not answered. Nothing may have moved.
    const waiting = await row("Ana");
    expect(waiting.getByText("Confirmada")).toBeInTheDocument();
    expect(waiting.queryByText("Marcada como concluída")).not.toBeInTheDocument();
    // The row is not pressable again until the read that follows says what happened.
    expect(waiting.getByRole("button", { name: "Marcar como concluído" })).toBeDisabled();

    release();
    await waitFor(() => expect(queueReads()).toBe(2));
  });

  it("claims nothing when the write is dropped: the refetch is the only witness", async () => {
    renderQueue("/admin/bookings");
    const ana = await row("Ana");

    await userEvent.click(ana.getByRole("button", { name: "Marcar como concluído" }));

    // The queue is read again — that is the whole of the answer. This one
    // answers with the booking exactly as it was, which is what a lost
    // compare-and-swap looks like from here.
    await waitFor(() => expect(queueReads()).toBe(2));
    const after = await row("Ana");
    expect(after.getByText("Confirmada")).toBeInTheDocument();
    expect(after.queryByText("Marcada como concluída")).not.toBeInTheDocument();
    // Nothing congratulates anybody. A success notice would be a sentence the
    // wire never justified: `bookingAdminMarkDone` answers `{ bookingId }`
    // whether it moved the row or lost the race to the platform's sweep.
    expect(screen.queryAllByRole("status")).toHaveLength(0);
    expect(screen.queryAllByRole("alert")).toHaveLength(0);
    // And the press is live again, because the queue has been re-read.
    expect(after.getByRole("button", { name: "Marcar como concluído" })).toBeEnabled();
  });

  it("says so when the platform refuses the action, and lets it be tried again", async () => {
    renderQueue("/admin/bookings", {
      answer: page([rowFixture(), rowFixture({ id: "bk-2", customerFirstName: "Bruno" })]),
      onMutation: () => new Error("nope"),
    });
    const ana = await row("Ana");

    await userEvent.click(ana.getByRole("button", { name: "Marcar como concluído" }));

    const refused = await row("Ana");
    expect(refused.getByRole("alert")).toHaveTextContent("Não foi possível concluir a reserva.");
    // The whole point of saying so. A refusal that also removes the only
    // control that could repeat it is a dead end, and the commonest refusal —
    // the row moved under you — is one a re-read fixes.
    await waitFor(() =>
      expect(refused.getByRole("button", { name: "Marcar como concluído" })).toBeEnabled(),
    );
    // A refusal re-reads the queue too: the row on screen is precisely the one
    // the platform has just said is out of date.
    expect(queueReads()).toBe(2);
    // And it is that row's failure, not the queue's.
    expect((await row("Bruno")).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("stops saying an action failed once another one works", async () => {
    const refuse = { markDone: true };
    renderQueue("/admin/bookings?tab=in_window", {
      answer: page([
        rowFixture({ id: "bk-1", customerFirstName: "Ana" }),
        MARKED_DONE_ROW,
      ]),
      onMutation: (field) =>
        field === "bookingAdminMarkDone" && refuse.markDone ? new Error("nope") : undefined,
    });

    await userEvent.click((await row("Ana")).getByRole("button", { name: "Marcar como concluído" }));
    // `getAllByRole`, not `getByRole`: `CollectionCard` draws every row twice,
    // once into the table and once into the phone's card list, so anything on
    // a row is in the document twice at once (see `row()` above).
    await waitFor(() => expect(screen.getAllByRole("alert")).not.toHaveLength(0));

    // A different row, a different action, and it succeeds. The sentence about
    // the first row must not survive it: it would be a false statement about
    // an action that worked, which is the one thing this screen must not say.
    await userEvent.click((await row("Carla")).getByRole("button", { name: "Concluir agora" }));

    await waitFor(() => expect(screen.queryAllByRole("alert")).toHaveLength(0));
  });

  it("names a refused dispute decision as a decision, not as a completion", async () => {
    renderQueue("/admin/bookings?tab=disputed", {
      answer: page([DISPUTED_ROW]),
      onMutation: () => new Error("nope"),
    });

    await userEvent.click((await row("Bruno")).getByRole("button", { name: "Dar razão ao cliente" }));

    // Upholding a dispute *cancels* the booking. "Não foi possível concluir a
    // reserva" would name the opposite of what was attempted.
    const refused = await row("Bruno");
    expect(refused.getByRole("alert")).toHaveTextContent("Não foi possível decidir a reclamação.");
    expect(refused.queryByText("Não foi possível concluir a reserva.")).not.toBeInTheDocument();
  });

  /**
   * Measured, not guessed: inside the real `AdminShell` the sidebar takes
   * 16rem from `md` up, so a 768px viewport leaves this card 462px while the
   * table it would draw is about 730 — every action button and the `ACÇÕES`
   * header off the right edge, behind a scrollbar inside the card. Cards until
   * `lg`, where the box is 718 and the table fits.
   */
  it("stays a list of cards until there is room for its table", async () => {
    renderQueue("/admin/bookings");
    // The rows, not just the table: while the card is loading it draws a
    // skeleton `div` where the card list will be, and there is no `ul` to find.
    await row("Ana");

    // Which rendering the viewport gets is two Tailwind classes and nothing
    // else, and jsdom evaluates neither — so the classes are what is held.
    expect(screen.getByRole("table").closest("div")).toHaveClass("lg:block");
    const cards = document.querySelector("ul.list-none")!;
    expect(cards.closest("div[class*='border-t']")).toHaveClass("lg:hidden");
  });

  it("names the empty tab in its own words", async () => {
    renderQueue("/admin/bookings?tab=disputed", { answer: page([]) });

    const table = await screen.findByRole("table");
    expect(await within(table).findByText("Sem reclamações")).toBeInTheDocument();
  });

  it("counts what is waiting, and pages when there is more than a page", async () => {
    const { router } = renderQueue("/admin/bookings", {
      answer: ({ offset }) =>
        offset === 0
          ? page([rowFixture()], { total: 21, nextOffset: 20 })
          : page([rowFixture({ id: "bk-21", customerFirstName: "Zita" })], { total: 21, nextOffset: null }),
    });
    await row("Ana");

    expect(screen.getByText("21 reservas a precisar de atenção")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Seguinte" }));

    await row("Zita");
    expect(within(await screen.findByRole("table")).queryByText("Ana")).not.toBeInTheDocument();
    expect(fakes.graphql).toHaveBeenCalledWith(expect.stringContaining("bookingNeedsAttentionForAdmin"), {
      input: { tab: "unclosed", limit: 20, offset: 20 },
    });
    // The page is in the URL, like the tab: a refresh here stays here.
    expect(router.state.location.search).toMatchObject({ offset: 20 });
  });

  it("opens the page named in the address bar, and ignores a nonsense one", async () => {
    renderQueue("/admin/bookings?offset=20", {
      answer: ({ offset }) =>
        page([rowFixture({ id: "bk-21", customerFirstName: "Zita" })], {
          total: 21,
          nextOffset: null,
          ...(offset === 0 ? { items: [rowFixture()] } : {}),
        }),
    });
    await row("Zita");
    expect(fakes.graphql).toHaveBeenCalledWith(expect.stringContaining("bookingNeedsAttentionForAdmin"), {
      input: { tab: "unclosed", limit: 20, offset: 20 },
    });
  });

  it("ignores an offset that is not a whole number of rows", async () => {
    const { router } = renderQueue("/admin/bookings?offset=-5");
    await row("Ana");

    expect(router.state.location.search).not.toMatchObject({ offset: -5 });
    expect(fakes.graphql).toHaveBeenCalledWith(expect.stringContaining("bookingNeedsAttentionForAdmin"), {
      input: { tab: "unclosed", limit: 20, offset: 0 },
    });
  });

  /**
   * The failure a queue meets by being used: you empty the page you are
   * standing on. Twenty-one bookings, page two holds one, you close it — and
   * page two is now empty while the count says twenty still need attention.
   */
  it("goes back to a page that has something on it when this one empties", async () => {
    const closed = { yes: false };
    const { router } = renderQueue("/admin/bookings?offset=20", {
      answer: ({ offset }) => {
        const total = closed.yes ? 20 : 21;
        if (offset === 0) return page([rowFixture()], { total, nextOffset: 20 });
        return page(closed.yes ? [] : [rowFixture({ id: "bk-21", customerFirstName: "Zita" })], {
          total,
          nextOffset: null,
        });
      },
      onMutation: () => {
        closed.yes = true;
        return undefined;
      },
    });

    await userEvent.click((await row("Zita")).getByRole("button", { name: "Marcar como concluído" }));

    await waitFor(() => expect(router.state.location.search).not.toMatchObject({ offset: 20 }));
    // Not stranded on an empty page under a count that says otherwise.
    await row("Ana");
    expect(within(await screen.findByRole("table")).queryByText("Nada por fechar")).not.toBeInTheDocument();
  });

  it("keeps a way back when the last page empties, rather than unmounting the pager", async () => {
    renderQueue("/admin/bookings?offset=20", {
      answer: ({ offset }) =>
        offset === 0
          ? page([rowFixture()], { total: 20, nextOffset: 20 })
          : page([], { total: 20, nextOffset: null }),
    });

    // `total` is exactly one page, so a pager gated on `total > 20` would have
    // unmounted both buttons while the reader stands on the second page.
    await waitFor(() => expect(screen.getByRole("button", { name: "Anterior" })).toBeInTheDocument());
  });
});
