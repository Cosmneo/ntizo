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

// Keeps the real module's other exports — see the identical note on the
// detail page's suite for what went missing when this returned the fake
// alone.
vi.mock("@/shared/lib/graphql/session-graphql", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/lib/graphql/session-graphql")>()),
  sessionGraphql: fakes.graphql,
}));

/**
 * The same validator the real route carries, duplicated rather than
 * imported — `src/routes/**` is the routes element and a `ui` test may not
 * import one. See the provider suite's identical note.
 *
 * `tab` and nothing else: the offset left the URL when the pager stopped
 * replacing the page and started extending it. See the route's own comment.
 */
function validateSearch(search: Record<string, unknown>): {
  tab?: CustomerBookingTab;
} {
  const tab = search["tab"];
  return (CUSTOMER_BOOKING_TABS as readonly string[]).includes(tab as string)
    ? { tab: tab as CustomerBookingTab }
    : {};
}

function bookingFixture(over: Partial<BookingDTO> = {}): BookingDTO {
  return {
    id: "bk-1",
    status: "AWAITING_PROVIDER",
    serviceId: "svc-1",
    serviceOptionId: "opt-1",
    providerId: "prv-1",
    serviceName: "Canalização",
    providerName: "Amélia Sitoe",
    providerSlug: "amelia-sitoe",
    serviceImageUrl: null,
    providerLogoUrl: null,
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
 * One answer per requested offset — what a real pager actually asks for. The
 * offset travels in the request's own `input`, so this dispatches on it
 * rather than on call order: "Mais" fires one request, and a render that
 * happens to re-issue the first would otherwise silently shift every answer.
 */
function setPagesByOffset(pages: Record<number, CustomerBookingPageDTO>) {
  fakes.graphql.mockReset();
  fakes.graphql.mockImplementation(
    (_query: string, variables: { input: { offset: number } }) => {
      const page = pages[variables.input.offset];
      if (!page) throw new Error(`no fixture for offset ${variables.input.offset}`);
      return Promise.resolve({ bookingMine: page });
    },
  );
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
 * The same row on the other screen — the card `CollectionCard` draws below
 * `md`, which is where a customer actually reads this list.
 *
 * Both renderings are always in the DOM and CSS picks between them, so an
 * assertion that does not say which one it means can pass on the strength of
 * the table while the card shows nothing. The card is found through the `ul`
 * the table has no counterpart for.
 */
async function card(serviceName: string) {
  const list = await screen.findByRole("list");
  const found = await within(list).findByText(serviceName, { exact: false });
  return within(found.closest("li")!);
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

  describe("the card a phone reads", () => {
    it("arranges the appointment, the pill and the total without labelling any of them", async () => {
      setPage(
        pageFixture([
          bookingFixture({ status: "PENDING_PAYMENT", priceMinor: 35_000, currency: "MZN" }),
        ]),
      );
      await renderBookings();

      const c = await card("Canalização");
      expect(c.getByText("A aguardar pagamento")).toBeInTheDocument();
      expect(c.getByText("350,00 MTn")).toBeInTheDocument();
      // "Estado" and "Valor" are two words of chrome per row on the screen
      // with the least room for any. They belong to the table's header, and
      // this card is not the table.
      expect(c.queryByText("Estado")).not.toBeInTheDocument();
      expect(c.queryByText("Valor")).not.toBeInTheDocument();
      expect(c.queryByText("Quando")).not.toBeInTheDocument();

      // And the table still carries all three, off `cells` — which is what
      // stops the two renderings from becoming two designs.
      const table = within(await screen.findByRole("table"));
      expect(table.getByText("Estado")).toBeInTheDocument();
      expect(table.getByText("Valor")).toBeInTheDocument();
      expect(table.getByText("350,00 MTn")).toBeInTheDocument();
    });

    it("gives the card a link to the booking that is not the title", async () => {
      // The title is a link on both screens, but a line of text is a poor
      // target for a thumb — this is the one the card is tapped by.
      setPage(pageFixture([bookingFixture({ id: "bk-9" })]));
      await renderBookings();

      const link = (await card("Canalização")).getByRole("link", { name: /Ver detalhe/ });
      expect(link).toHaveAttribute("href", "/bookings/bk-9");
    });

    it("offers the provider a message from every row, whatever the booking's status", async () => {
      // A customer with a question about a job that is over has the same
      // right to ask it as one waiting to pay, so this is not gated on
      // status the way Pagar and Cancelar are.
      setPage(pageFixture([bookingFixture({ status: "CANCELLED" })]));
      await renderBookings();

      expect(
        (await card("Canalização")).getByRole("button", { name: /Mensagem/ }),
      ).toBeInTheDocument();
    });

    it("draws the service photo when the booking has one", async () => {
      setPage(
        pageFixture([bookingFixture({ serviceImageUrl: "https://media.test/svc-1.jpg" })]),
      );
      await renderBookings();

      // By tag, not by role: `alt=""` is deliberate — the title is right
      // beside it and reading the service name twice says nothing new the
      // second time — and an empty alt makes the image presentational, so
      // `getByRole("img")` correctly finds nothing.
      const list = await screen.findByRole("list");
      expect(list.querySelector("li img")).toHaveAttribute(
        "src",
        "https://media.test/svc-1.jpg",
      );
    });

    it("draws the house fallback when it has none", async () => {
      // Not a grey rectangle and not a broken-image glyph: `BrandImage`'s
      // mark on the soft ground, which is what every missing picture in the
      // app shows. Most bookings have no photo, so this is the common case
      // rather than the exception.
      setPage(pageFixture([bookingFixture({ serviceImageUrl: null })]));
      await renderBookings();

      const list = await screen.findByRole("list");
      expect(list.querySelector("li img")).toBeNull();
      expect((await card("Canalização")).getByTestId("media-fallback")).toBeInTheDocument();
    });
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
  // "1800,00 MTn", not "1 800 MZN" — `formatAmount` (shared with checkout's
  // own rail total, so the number a customer approved and the number this row
  // shows agree) leaves `currencyDisplay` at its default, which is `pt-MZ`'s
  // own narrow symbol for MZN, and leaves grouping at `pt-MZ`'s default,
  // which does not group four digits. Printed once with `node -e` against
  // this exact call and copied here rather than guessed — see the report for
  // the command.
  it("never prints a commission", async () => {
    setPage(pageFixture([bookingFixture({ priceMinor: 180_000 })]));
    await renderBookings();

    const r = await row("Canalização");
    expect(r.getByText("1800,00 MTn")).toBeInTheDocument();
    expect(screen.queryByText(/comiss/i)).not.toBeInTheDocument();
  });

  /**
   * I1. The row used to run through `formatHeadlinePrice`, whose own doc
   * comment forbids it for a total: `maximumFractionDigits: 0` turns a
   * booking of 1800,50 into "1 801 MTn" — a number nobody is charged, on the
   * row whose button opens a dialog asking for a PIN.
   */
  it("shows the exact price, never a rounded headline", async () => {
    setPage(pageFixture([bookingFixture({ priceMinor: 180_050 })]));
    await renderBookings();

    const r = await row("Canalização");
    expect(r.getByText("1800,50 MTn")).toBeInTheDocument();
    expect(r.queryByText(/1 801/)).not.toBeInTheDocument();
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

  /**
   * I7. "Mais" used to navigate to `?offset=20`, which keyed a different
   * cache entry and *replaced* the rows on screen — so the reader lost what
   * they were looking at, `CollectionCard`'s header went on saying "20 de 45"
   * while showing rows 21 to 40, and nothing went back. The provider's list
   * settled this shape already: the next page is added under the current one.
   */
  describe("paging", () => {
    const twenty = (offset: number) =>
      Array.from({ length: 20 }, (_, i) =>
        bookingFixture({ id: `bk-${offset + i}`, serviceName: `Serviço ${offset + i}` }),
      );

    it("adds the next page under the rows already there, and keeps the count honest", async () => {
      setPagesByOffset({
        0: pageFixture(twenty(0), { total: 25, nextOffset: 20 }),
        20: pageFixture(twenty(20).slice(0, 5), { total: 25, nextOffset: null }),
      });
      await renderBookings();

      const table = within(await screen.findByRole("table"));
      expect(await table.findByText(/Serviço 0/)).toBeInTheDocument();
      expect(screen.getByText("20 de 25 mostradas")).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Mais" }));

      // The first page is still there — "Mais" extends, it does not replace.
      await waitFor(() => expect(table.getByText(/Serviço 20/)).toBeInTheDocument());
      expect(table.getByText(/Serviço 0/)).toBeInTheDocument();
      // And the count says what is actually on screen.
      expect(screen.getByText("25 de 25 mostradas")).toBeInTheDocument();
    });

    it("offers no Mais on the last page", async () => {
      setPage(pageFixture([bookingFixture()], { total: 1, nextOffset: null }));
      await renderBookings();

      await screen.findByRole("table");
      expect(screen.queryByRole("button", { name: "Mais" })).not.toBeInTheDocument();
    });

    it("starts the list over when the tab changes", async () => {
      setPagesByOffset({
        0: pageFixture(twenty(0), { total: 25, nextOffset: 20 }),
        20: pageFixture(twenty(20).slice(0, 5), { total: 25, nextOffset: null }),
      });
      await renderBookings();

      await screen.findByText("20 de 25 mostradas");
      await userEvent.click(screen.getByRole("button", { name: "Mais" }));
      await waitFor(() =>
        expect(screen.getByText("25 de 25 mostradas")).toBeInTheDocument(),
      );

      await userEvent.click(screen.getByRole("tab", { name: /Próximas/ }));

      // Offset zero again — a tab is a new list, not a continuation of the
      // one before it.
      await waitFor(() =>
        expect(screen.getByText("20 de 25 mostradas")).toBeInTheDocument(),
      );
    });
  });

  /**
   * I3's list half. `customerWhere` already excludes drafts from every tab,
   * so this is belt to its braces — but the branch rule is that `DRAFT`
   * appears in no tab and on no customer page, and a row here would offer to
   * cancel a checkout the customer does not believe exists (and would print
   * the literal `status.DRAFT`, which no locale has a word for).
   */
  it("renders no row for a draft, even if the read ever returned one", async () => {
    setPage(
      pageFixture([
        bookingFixture({ id: "bk-draft", status: "DRAFT", serviceName: "Meio a caminho" }),
        bookingFixture({ id: "bk-real", serviceName: "Canalização" }),
      ]),
    );
    await renderBookings();

    const table = within(await screen.findByRole("table"));
    expect(await table.findByText(/Canalização/)).toBeInTheDocument();
    expect(table.queryByText(/Meio a caminho/)).not.toBeInTheDocument();
    expect(screen.queryByText("status.DRAFT")).not.toBeInTheDocument();
  });
});
