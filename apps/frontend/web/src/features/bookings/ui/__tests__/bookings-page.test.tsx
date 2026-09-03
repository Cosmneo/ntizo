import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type {
  BookingDTO,
  CustomerBookingPageDTO,
} from "@ntizo/shared/read-models";
import { CUSTOMER_BOOKING_TABS, type CustomerBookingTab } from "@ntizo/shared";
import i18n from "@/shared/lib/i18n";
import { BookingsPage } from "../bookings-page";

/**
 * The network is the seam, and it is the only one — the same boundary the
 * provider zone's own `bookings-page.test.tsx` draws, for the same reason:
 * everything between this page and the wire (the query key, the paging
 * input, the tab) is this feature's own.
 */
const fakes = vi.hoisted(() => ({ graphql: vi.fn() }));

vi.mock("@/shared/lib/graphql/session-graphql", () => ({
  sessionGraphql: fakes.graphql,
}));

/**
 * The same validator the real route carries, duplicated rather than
 * imported — `src/routes/**` is the routes element and a `ui` test may not
 * import one. See the provider suite's identical note.
 */
function validateSearch(search: Record<string, unknown>): {
  tab?: CustomerBookingTab;
  offset?: number;
} {
  const tab = search["tab"];
  const offset = search["offset"];
  return {
    ...((CUSTOMER_BOOKING_TABS as readonly string[]).includes(tab as string)
      ? { tab: tab as CustomerBookingTab }
      : {}),
    ...(typeof offset === "number" && offset > 0 ? { offset } : {}),
  };
}

function bookingFixture(over: Partial<BookingDTO> = {}): BookingDTO {
  return {
    id: "bk-1",
    status: "AWAITING_PROVIDER",
    serviceId: "svc-1",
    serviceOptionId: "opt-1",
    serviceName: "Canalização",
    providerName: "Amélia Sitoe",
    providerSlug: "amelia-sitoe",
    providerVerified: true,
    providerRatingAverage: 4.8,
    optionName: "Reparação de fuga",
    durationMinutes: 120,
    locationType: "at_customer",
    priceMinor: 180_000,
    currency: "MZN",
    startsAt: "2026-09-08T14:30:00.000Z",
    endsAt: "2026-09-08T16:30:00.000Z",
    timezone: "Africa/Maputo",
    addressLabel: "Casa",
    addressLine: "Av. Julius Nyerere 1234",
    addressCity: "Maputo",
    addressDistrict: "Bairro Central",
    addressDirections: null,
    description: null,
    expiresAt: null,
    paidAt: null,
    createdAt: "2026-09-03T08:00:00.000Z",
    ...over,
  };
}

function pageFixture(
  items: BookingDTO[],
  over: Partial<CustomerBookingPageDTO> = {},
): CustomerBookingPageDTO {
  return {
    items,
    total: items.length,
    nextOffset: null,
    counts: { waiting: items.length, upcoming: 0, history: 0 },
    ...over,
  };
}

/** What the server answers with, for every request this render makes. */
function setPage(page: CustomerBookingPageDTO) {
  fakes.graphql.mockReset();
  fakes.graphql.mockResolvedValue({ bookingMine: page });
}

/**
 * `await router.load()` before `render()`: this router commits its first
 * match through an async transition, matching the idiom in
 * `src/features/landing/ui/__tests__/footer.test.tsx` and
 * `src/features/admin/contact/ui/__tests__/contact-page.test.tsx` — a route
 * component rendered without it has no loaded match and throws.
 *
 * A `/services` stub sits alongside `/bookings` so the empty state's own
 * `Link` resolves against a route the router actually knows about.
 */
async function renderBookings(opts: { tab?: CustomerBookingTab } = {}) {
  const rootRoute = createRootRoute();
  const bookingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/bookings",
    validateSearch,
    component: BookingsPage,
  });
  const servicesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/services",
    component: () => <p>services</p>,
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    routeTree: rootRoute.addChildren([bookingsRoute, servicesRoute]),
    history: createMemoryHistory({
      initialEntries: [opts.tab ? `/bookings?tab=${opts.tab}` : "/bookings"],
    }),
  });
  await router.load();
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router };
}

/**
 * One row of the table, by the service it belongs to.
 *
 * jsdom applies no CSS, so `CollectionCard`'s two layouts — the table from
 * `md` and the stacked cards below it — are both in the document and every
 * value on a row is present twice (`collection-card.test.tsx` asserts this
 * directly). Naming the table's row picks one of the two, and keeps every
 * assertion about one row rather than about the whole page.
 */
async function row(serviceName: string) {
  const table = await screen.findByRole("table");
  // Not an exact match: the service and its option share one `<p>` as two
  // sibling text nodes ("Canalização" · "Reparação de fuga"), so no element's
  // own text content is the service name alone.
  const cell = await within(table).findByText(serviceName, { exact: false });
  return within(cell.closest("tr")!);
}

/**
 * The locale is pinned, not inherited: every assertion here reads Portuguese
 * copy and the suite's default resolves to English (`test/setup.ts`).
 */
beforeEach(async () => {
  await i18n.changeLanguage("pt-MZ");
});

afterEach(async () => {
  await i18n.changeLanguage("en-US");
});

describe("BookingsPage", () => {
  it("shows a row per booking with its status in words", async () => {
    setPage(
      pageFixture([
        bookingFixture({
          status: "AWAITING_PROVIDER",
          serviceName: "Limpeza profunda",
        }),
      ]),
    );
    await renderBookings();

    const r = await row("Limpeza profunda");
    expect(r.getByText("À espera do prestador")).toBeInTheDocument();
  });

  // The two buttons live in the first tab and nowhere else. A confirmed
  // booking has nothing a customer can do to it in this product.
  //
  // `canCancel` is *also* true for `PENDING_PAYMENT` — cancelling stays on
  // the table right up until payment lands, and the detail page (a later
  // task) shows both at once. This row has room for one action, and it is
  // the one actually being waited on: Cancelar must not appear beside it.
  it("offers pay only while the payment is what is being waited for", async () => {
    setPage(pageFixture([bookingFixture({ status: "PENDING_PAYMENT" })]));
    await renderBookings();

    const r = await row("Canalização");
    expect(r.getByRole("button", { name: "Pagar" })).toBeInTheDocument();
    expect(
      r.queryByRole("button", { name: "Cancelar" }),
    ).not.toBeInTheDocument();
  });

  it("offers cancel only while the provider hasn't answered yet", async () => {
    setPage(pageFixture([bookingFixture({ status: "AWAITING_PROVIDER" })]));
    await renderBookings();

    const r = await row("Canalização");
    expect(r.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
    expect(r.queryByRole("button", { name: "Pagar" })).not.toBeInTheDocument();
  });

  it("offers no action on a confirmed booking", async () => {
    setPage(
      pageFixture([bookingFixture({ status: "CONFIRMED" })], {
        counts: { waiting: 0, upcoming: 1, history: 0 },
      }),
    );
    await renderBookings({ tab: "upcoming" });

    const r = await row("Canalização");
    expect(r.getByText("Confirmada")).toBeInTheDocument();
    expect(r.queryByRole("button", { name: "Pagar" })).not.toBeInTheDocument();
    expect(
      r.queryByRole("button", { name: "Cancelar" }),
    ).not.toBeInTheDocument();
  });

  it("renders the tab counts", async () => {
    setPage(
      pageFixture([], { counts: { waiting: 2, upcoming: 1, history: 4 } }),
    );
    await renderBookings();

    // `findByRole` stops at the first match, which exists before the count
    // has arrived (the tab's name is bare "A aguardar" on the loading
    // render) — the assertion has to wait for the count itself, not just
    // for the tab to exist.
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /A aguardar/ })).toHaveTextContent(
        "2",
      ),
    );
  });

  it("says the tab is empty and offers a way out", async () => {
    setPage(pageFixture([]));
    await renderBookings();

    const table = within(await screen.findByRole("table"));
    expect(await table.findByText("Ainda não há reservas")).toBeInTheDocument();
    expect(
      table.getByRole("link", { name: "Explorar serviços" }),
    ).toBeInTheDocument();
  });

  // The rule the whole read model was reshaped for. Worth one assertion at
  // the surface too: this is where a regression would actually be seen.
  //
  // "1 800 MTn", not "1 800 MZN" — `formatHeadlinePrice` (shared with the
  // directory's browse cards, so every price on the platform agrees) leaves
  // `currencyDisplay` at its default, which is `pt-MZ`'s own narrow symbol
  // for MZN. Printed once with `bun apps/frontend/web/…` against this exact
  // call and copied here rather than guessed — see the report for the
  // command.
  it("never prints a commission", async () => {
    setPage(pageFixture([bookingFixture({ priceMinor: 180_000 })]));
    await renderBookings();

    const r = await row("Canalização");
    expect(r.getByText("1 800 MTn")).toBeInTheDocument();
    expect(screen.queryByText(/comiss/i)).not.toBeInTheDocument();
  });

  it("has no search box — a client-side filter would lie about a booking sitting on the next page", async () => {
    setPage(pageFixture([bookingFixture()]));
    await renderBookings();

    await screen.findByRole("table");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  describe("the countdown reads the status before the date", () => {
    /**
     * `deadlineOf`'s whole reason to exist: `expiresAt` is never cleared, so
     * a confirmed booking can carry a leftover deadline from whichever of
     * the three windows it last held. A *future* leftover is the case that
     * actually distinguishes a correct `deadlineOf` from a naive one — a
     * past leftover would print no countdown even without the status gate,
     * because `timeLeftWording` already refuses a deadline that has passed.
     * Both are covered below: the brief's own past-dated case, and this one.
     */
    it("shows no countdown on a confirmed booking with a stale, already-past deadline", async () => {
      setPage(
        pageFixture(
          [
            bookingFixture({
              status: "CONFIRMED",
              expiresAt: new Date(Date.now() - 10 * 60_000).toISOString(),
            }),
          ],
          { counts: { waiting: 0, upcoming: 1, history: 0 } },
        ),
      );
      await renderBookings({ tab: "upcoming" });

      const r = await row("Canalização");
      expect(r.getByText("Confirmada")).toBeInTheDocument();
      expect(r.queryByText(/responde em|termina em/)).not.toBeInTheDocument();
    });

    it("shows no countdown on a confirmed booking even when its leftover deadline is still ahead of now", async () => {
      setPage(
        pageFixture(
          [
            bookingFixture({
              status: "CONFIRMED",
              expiresAt: new Date(Date.now() + 90 * 60_000).toISOString(),
            }),
          ],
          { counts: { waiting: 0, upcoming: 1, history: 0 } },
        ),
      );
      await renderBookings({ tab: "upcoming" });

      const r = await row("Canalização");
      expect(r.queryByText(/responde em|termina em/)).not.toBeInTheDocument();
    });

    it("counts down a pending-payment booking whose deadline is still running", async () => {
      setPage(
        pageFixture([
          bookingFixture({
            status: "PENDING_PAYMENT",
            expiresAt: new Date(
              Date.now() + 90 * 60_000 + 30_000,
            ).toISOString(),
          }),
        ]),
      );
      await renderBookings();

      const r = await row("Canalização");
      expect(r.getByText(/termina em/)).toBeInTheDocument();
    });
  });
});
