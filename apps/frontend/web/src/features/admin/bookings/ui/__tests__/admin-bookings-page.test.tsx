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
function validateSearch(search: Record<string, unknown>): { tab?: AdminBookingTab } {
  const tab = search["tab"];
  return {
    tab:
      typeof tab === "string" && (ADMIN_BOOKING_TABS as readonly string[]).includes(tab)
        ? (tab as AdminBookingTab)
        : undefined,
  };
}

/** Two days and a bit ago, so "waiting 2 d" is the answer for any run. */
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
    expect(ana.getByRole("link", { name: "Estúdio Mavalane" })).toBeInTheDocument();
    expect(ana.getByText("Corte de cabelo")).toBeInTheDocument();
    expect(ana.getByText("à espera há 2 d")).toBeInTheDocument();
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
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // And the press is live again, because the queue has been re-read.
    expect(after.getByRole("button", { name: "Marcar como concluído" })).toBeEnabled();
  });

  it("says so when the platform refuses the action", async () => {
    renderQueue("/admin/bookings", {
      onMutation: () => new Error("nope"),
    });
    const ana = await row("Ana");

    await userEvent.click(ana.getByRole("button", { name: "Marcar como concluído" }));

    expect(
      await screen.findByText("Não foi possível concluir a reserva."),
    ).toBeInTheDocument();
  });

  it("names the empty tab in its own words", async () => {
    renderQueue("/admin/bookings?tab=disputed", { answer: page([]) });

    const table = await screen.findByRole("table");
    expect(await within(table).findByText("Sem reclamações")).toBeInTheDocument();
  });

  it("counts what is waiting, and pages when there is more than a page", async () => {
    renderQueue("/admin/bookings", {
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
  });
});
