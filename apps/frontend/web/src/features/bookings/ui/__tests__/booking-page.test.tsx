import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type { CustomerBookingDetailDTO } from "@ntizo/shared/read-models";
import i18n from "@/shared/lib/i18n";
import { BookingPage } from "../booking-page";

/**
 * The network is the seam, and it is the only one — the same boundary the
 * list's own `bookings-page.test.tsx` draws and for the same reason:
 * everything between this page and the wire (the query key, the `bookingId`
 * input) is this feature's own.
 */
const fakes = vi.hoisted(() => ({ graphql: vi.fn() }));

// The real module's other exports are kept, and `sessionGraphql` alone is
// replaced. A factory that returned only the fake left `GraphqlError`
// undefined, and `messagingErrorCode` — reached through the page's
// "Mensagem" button — reads that class to tell a domain refusal from a
// coarse wire code. Losing it took the whole page down at import time.
vi.mock("@/shared/lib/graphql/session-graphql", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/lib/graphql/session-graphql")>()),
  sessionGraphql: fakes.graphql,
}));

function bookingFixture(
  over: Partial<CustomerBookingDetailDTO> = {},
): CustomerBookingDetailDTO {
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
    timeline: [],
    ...over,
  };
}

/** What the server answers `bookingById` with, for every request this render makes. */
function setDetail(detail: CustomerBookingDetailDTO | null) {
  fakes.graphql.mockReset();
  fakes.graphql.mockResolvedValue({ bookingById: detail });
}

/**
 * `await router.load()` before `render()`: this router commits its first
 * match through an async transition, the same idiom the list's own
 * `renderBookings` uses — a route component rendered without it has no
 * loaded match and throws.
 *
 * A `/bookings` stub sits alongside `/bookings/$bookingId` so the back link
 * resolves against a route the router actually knows about.
 */
async function renderBooking(bookingId = "bk-1") {
  const rootRoute = createRootRoute();
  const detailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/bookings/$bookingId",
    component: BookingPage,
  });
  const listRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/bookings",
    component: () => <p>lista</p>,
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    routeTree: rootRoute.addChildren([detailRoute, listRoute]),
    history: createMemoryHistory({ initialEntries: [`/bookings/${bookingId}`] }),
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
 * The locale is pinned, not inherited: every assertion here reads Portuguese
 * copy and the suite's default resolves to English (`test/setup.ts`).
 */
beforeEach(async () => {
  await i18n.changeLanguage("pt-MZ");
});

afterEach(async () => {
  await i18n.changeLanguage("en-US");
});

describe("BookingPage", () => {
  it("tells the story of the booking in order", async () => {
    setDetail(
      bookingFixture({
        status: "PENDING_PAYMENT",
        timeline: [
          {
            at: "2026-09-03T08:12:00Z",
            reason: "created_by_customer",
            actor: "customer",
            pending: false,
          },
          {
            at: "2026-09-03T09:40:00Z",
            reason: "accepted_by_provider",
            actor: "provider",
            pending: false,
          },
          { at: "2026-09-03T10:02:00Z", reason: "pay_by", actor: "system", pending: true },
        ],
      }),
    );
    await renderBooking();

    const steps = await screen.findAllByRole("listitem");
    // Three hops the server sent, then the one still ahead of them. The last
    // is the page's own addition and carries no date, because it has none to
    // give — see `upcomingSteps`.
    expect(steps.map((s) => s.textContent)).toEqual([
      expect.stringContaining("Pedido enviado"),
      expect.stringContaining("Prestador aceitou"),
      expect.stringContaining("A aguardar o seu pagamento"),
      "Reserva confirmada",
    ]);
  });

  it("names both steps still to come while the provider has not answered", async () => {
    // The case a first-time customer most needs told: the server's timeline
    // says a request was sent and a deadline is running, and stops there.
    // Payment and confirmation are what happens next, and nothing on the page
    // said so.
    setDetail(
      bookingFixture({
        status: "AWAITING_PROVIDER",
        timeline: [
          {
            at: "2026-09-03T08:12:00Z",
            reason: "created_by_customer",
            actor: "customer",
            pending: false,
          },
          { at: "2026-09-03T10:02:00Z", reason: "respond_by", actor: "system", pending: true },
        ],
      }),
    );
    await renderBooking();
    expect((await screen.findAllByRole("listitem")).map((s) => s.textContent)).toEqual([
      expect.stringContaining("Pedido enviado"),
      expect.stringContaining("A aguardar resposta do prestador"),
      "Pagamento",
      "Reserva confirmada",
    ]);
  });

  it("promises nothing further once the booking is confirmed", async () => {
    // Because there is nothing further the platform can do: work happening,
    // being marked done and money being released have no transitions today.
    // A ladder drawn from the design rather than from the machine would show
    // all three greyed, and they would never light up.
    setDetail(
      bookingFixture({
        status: "CONFIRMED",
        timeline: [
          {
            at: "2026-09-03T08:12:00Z",
            reason: "created_by_customer",
            actor: "customer",
            pending: false,
          },
          {
            at: "2026-09-03T12:30:00Z",
            reason: "payment_confirmed",
            actor: "system",
            pending: false,
          },
        ],
      }),
    );
    await renderBooking();
    expect((await screen.findAllByRole("listitem")).map((s) => s.textContent)).toEqual([
      expect.stringContaining("Pedido enviado"),
      expect.stringContaining("Pagamento confirmado"),
    ]);
  });

  // "1800,00 MTn", not "1 800 MZN" — `formatAmount` (shared with the list's
  // own price cell and with checkout's rail, so every price on this page
  // agrees with the row it was opened from and with what was approved) leaves
  // `currencyDisplay` at its default, which is `pt-MZ`'s own narrow symbol
  // for MZN. Verified against the list's own identical assertion in
  // `bookings-page.test.tsx` rather than guessed.
  /**
   * Two decisions that are invisible to every other assertion in this file,
   * because jsdom has no viewport and never applies a breakpoint. Pinned as
   * classes for exactly that reason: nothing else here can tell that the
   * phone layout came back, and a merge that took the other side of this file
   * would put it back silently.
   */
  describe("the layout a phone gets", () => {
    it("puts the money and the timeline above the record, and back beside it on a laptop", async () => {
      // One column stacks in source order, and source order is the two-column
      // layout's: the record first, the rail second. Stacked, that buried
      // "quanto pago" and "onde é que isto está" under the address, the
      // duration and the customer's own note — three blocks they wrote
      // themselves.
      setDetail(bookingFixture());
      await renderBooking();
      await screen.findByRole("heading", { level: 1 });

      const rail = document.querySelector("aside")!;
      expect(rail.className).toContain("order-1");
      expect(rail.className).toContain("lg:order-2");
    });

    it("gives Cancelar and Pagar the whole width, stacked, until there is room for a row", async () => {
      // Wrapping under the header at whatever width their words gave them
      // left Pagar as a half-width button beside Cancelar on a 360px screen:
      // neither an easy target, and the destructive one exactly as prominent
      // as the action being waited for.
      setDetail(bookingFixture({ status: "PENDING_PAYMENT" }));
      await renderBooking();

      const group = await screen.findByRole("group", { name: "Ações" });
      expect(group.className).toContain("flex-col");
      expect(group.className).toContain("sm:flex-row");
      // Written in their real order, so what is read and what is tabbed
      // agree with what is on the screen — no `flex-col-reverse`. Pagar
      // lands at the bottom of the pair, where a thumb already is.
      expect(group.className).not.toContain("flex-col-reverse");
      for (const button of within(group).getAllByRole("button")) {
        expect(button.className).toContain("w-full");
        expect(button.className).toContain("sm:w-auto");
      }
    });
  });

  it("points at the provider's public page, by the slug this read already carried", async () => {
    // The reviews, the other services and the trading hours all live there,
    // and a booking's own record has no business repeating any of them. The
    // slug has been on this read since checkout needed it — nothing new had
    // to be fetched to offer this.
    setDetail(bookingFixture({ providerSlug: "amelia-sitoe" }));
    await renderBooking();

    expect(await screen.findByRole("link", { name: "Ver perfil" })).toHaveAttribute(
      "href",
      "/providers/amelia-sitoe",
    );
  });

  it("offers a message to the provider on a booking that is over", async () => {
    // Not gated on status, unlike Cancelar and Pagar: a question about a job
    // that was declined is still a question. `providerId` is what makes this
    // possible at all — `communicationStartThread` takes an id and the slug
    // could not have answered for it.
    setDetail(bookingFixture({ status: "DECLINED" }));
    await renderBooking();

    expect(
      await screen.findByRole("button", { name: /Mensagem/ }),
    ).toBeInTheDocument();
  });

  it("shows the provider's logo when there is one, and their initials when there is not", async () => {
    setDetail(bookingFixture({ providerLogoUrl: "https://media.test/logo.png" }));
    await renderBooking();
    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(
      document.querySelector('img[src="https://media.test/logo.png"]'),
    ).toBeInTheDocument();
  });

  it("falls back to initials rather than the brand mark where a face belongs", async () => {
    // `BrandImage`'s mark is right for a missing photograph and wrong here:
    // the Ntizo logo where a business's own avatar goes reads as "booked with
    // Ntizo". "AS" says who, in the business's own name.
    setDetail(bookingFixture({ providerLogoUrl: null, providerName: "Amélia Sitoe" }));
    await renderBooking();

    expect(await screen.findByText("AS")).toBeInTheDocument();
  });

  it("shows the total and never a split", async () => {
    setDetail(bookingFixture({ priceMinor: 180_000, currency: "MZN" }));
    await renderBooking();

    expect(await screen.findByText("1800,00 MTn")).toBeInTheDocument();
    expect(screen.queryByText(/comiss/i)).not.toBeInTheDocument();
  });

  /**
   * I1. "Total a pagar" is what the customer owes and the Pagar button names
   * what this press will debit — neither may be rounded. Through
   * `formatHeadlinePrice`, both read "1 801 MTn" for a booking of 1800,50.
   */
  it("prints the exact total, and names it exactly on the Pagar button", async () => {
    setDetail(
      bookingFixture({ status: "PENDING_PAYMENT", priceMinor: 180_050, currency: "MZN" }),
    );
    await renderBooking();

    expect(await screen.findByText("1800,50 MTn")).toBeInTheDocument();
    // `toHaveTextContent`, not `getByRole`'s own `name` — that one compares
    // the accessible name with no normalizer at all, and `Intl.NumberFormat`
    // separates the amount from its currency symbol with U+00A0.
    expect(screen.getByRole("button", { name: /^Pagar/ })).toHaveTextContent(
      "Pagar 1800,50 MTn",
    );
    expect(screen.queryByText(/1 801/)).not.toBeInTheDocument();
  });

  it("says when a paid booking was paid", async () => {
    setDetail(bookingFixture({ status: "CONFIRMED", paidAt: "2026-09-01T14:07:00Z" }));
    await renderBooking();

    expect(await screen.findByText(/Pago a/)).toBeInTheDocument();
  });

  // Not "are you sure it is yours" — the read cannot tell a stranger's id
  // from a missing one, and the page must not imply it can.
  it("renders the not-found card for a booking that is not the caller's", async () => {
    setDetail(null);
    await renderBooking();

    expect(await screen.findByText("Reserva não encontrada")).toBeInTheDocument();
  });

  /**
   * I3. `findForCustomer` deliberately has no draft guard — checkout's steps
   * 2 and 3 read the customer's own draft through that very query — so the
   * refusal has to be this page's. Reached by URL, a draft used to render a
   * pill reading the literal `status.DRAFT` (no locale has that key, and
   * correctly so) over a timeline claiming a request had been sent and an
   * empty address block.
   */
  it("treats a draft as not found rather than drawing it", async () => {
    setDetail(bookingFixture({ status: "DRAFT" }));
    await renderBooking();

    expect(await screen.findByText("Reserva não encontrada")).toBeInTheDocument();
    expect(screen.queryByText("status.DRAFT")).not.toBeInTheDocument();
    expect(screen.queryByText(/Pedido enviado/)).not.toBeInTheDocument();
  });

  // Regression: `td(\`location.${type}\`)` printed the literal key —
  // `directory.json` has no `location` object, every other consumer of
  // `locationType` reads `filterWhereOption.${type}`. An assertion that only
  // checks an element exists would pass on either the phrase or the raw key,
  // so this checks the actual text, not just its presence.
  it("prints the location's human phrase, not its translation key", async () => {
    setDetail(bookingFixture({ locationType: "at_customer" }));
    await renderBooking();

    expect(await screen.findByText(/Em sua casa/)).toBeInTheDocument();
    expect(screen.queryByText(/location\.at_customer/)).not.toBeInTheDocument();
    expect(screen.queryByText(/filterWhereOption\.at_customer/)).not.toBeInTheDocument();
  });

  it("shows both actions while payment is what is being waited for", async () => {
    setDetail(bookingFixture({ status: "PENDING_PAYMENT" }));
    await renderBooking();

    expect(await screen.findByRole("button", { name: "Cancelar reserva" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Pagar/ })).toBeInTheDocument();
  });

  it("shows neither action on a confirmed booking, and points to support instead", async () => {
    setDetail(bookingFixture({ status: "CONFIRMED", paidAt: "2026-09-01T14:07:00Z" }));
    await renderBooking();

    await screen.findByText(/Pago a/);
    expect(screen.queryByRole("button", { name: "Cancelar reserva" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Pagar/ })).not.toBeInTheDocument();
    expect(screen.getByText("Precisa de mudar ou desmarcar?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Falar com o suporte" })).toBeInTheDocument();
  });

  // A reason no locale has a word for still gets a line, in the fallback
  // wording — never the raw token, which is what a customer would see if
  // `defaultValue` were ever dropped from the lookup.
  it("falls back to the generic wording for a timeline reason with no translation", async () => {
    setDetail(
      bookingFixture({
        timeline: [
          {
            at: "2026-09-03T08:12:00Z",
            reason: "some_future_reason_nobody_translated_yet",
            actor: "system",
            pending: false,
          },
        ],
      }),
    );
    await renderBooking();

    expect(await screen.findByText("Estado alterado")).toBeInTheDocument();
    expect(
      screen.queryByText(/some_future_reason_nobody_translated_yet/),
    ).not.toBeInTheDocument();
  });
});
