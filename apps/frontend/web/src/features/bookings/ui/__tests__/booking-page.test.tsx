import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

vi.mock("@/shared/lib/graphql/session-graphql", () => ({
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
    expect(steps.map((s) => s.textContent)).toEqual([
      expect.stringContaining("Pedido enviado"),
      expect.stringContaining("Prestador aceitou"),
      expect.stringContaining("A aguardar o seu pagamento"),
    ]);
  });

  // "1 800 MTn", not "1 800 MZN" — `formatHeadlinePrice` (shared with the
  // list's own price cell, so every price on this page agrees with the row
  // it was opened from) leaves `currencyDisplay` at its default, which is
  // `pt-MZ`'s own narrow symbol for MZN. Verified against the list's own
  // identical assertion in `bookings-page.test.tsx` rather than guessed.
  it("shows the total and never a split", async () => {
    setDetail(bookingFixture({ priceMinor: 180_000, currency: "MZN" }));
    await renderBooking();

    expect(await screen.findByText("1 800 MTn")).toBeInTheDocument();
    expect(screen.queryByText(/comiss/i)).not.toBeInTheDocument();
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
