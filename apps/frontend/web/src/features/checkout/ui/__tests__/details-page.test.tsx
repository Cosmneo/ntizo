import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type { AddressDTO } from "@ntizo/shared";
import type { BookingDTO } from "@ntizo/shared/read-models";
import i18n from "@/shared/lib/i18n";
import { readDraftDetails } from "@/features/checkout/domain/draft-store";

/**
 * Both reads are mocked at the **data** layer, so the real viewmodels run.
 *
 * That is deliberate rather than convenient. The address book's real
 * `useMyAddresses`/`useAddressMutations` are what invalidate and refetch the
 * list after a row is added, and a mocked hook handed a ready-made array
 * would assert nothing about that wiring — which is exactly the wiring this
 * page depends on when its empty state turns into its first address.
 * `vi.mock` names a module rather than importing one, so no `ui -> data` edge
 * is created and `boundaries/dependencies` stays satisfied; the choose-when
 * suite documents the same choice for the same rule.
 *
 * The city gazetteer is mocked too. `AddressForm` opens on `MZ`, so its
 * picker fires a real `publicGraphql` request the moment the form renders,
 * and a suite that lets that reach the network is a suite whose failures
 * depend on a socket.
 */
const fakes = vi.hoisted(() => ({
  booking: null as unknown,
  addresses: [] as AddressDTO[],
  addAddress: vi.fn(),
  updateAddress: vi.fn(),
  deleteAddress: vi.fn(),
}));

vi.mock("@/features/checkout/data/checkout.repository", () => ({
  bookingQueries: {
    byId: (bookingId: string) => ({
      queryKey: ["booking", bookingId],
      queryFn: async () => fakes.booking,
    }),
  },
  createBooking: vi.fn(),
}));

vi.mock("@/features/account/data/address.repository", () => ({
  addressQueries: {
    mine: () => ({ queryKey: ["user", "addresses"], queryFn: async () => fakes.addresses }),
  },
  addAddress: fakes.addAddress,
  updateAddress: fakes.updateAddress,
  deleteAddress: fakes.deleteAddress,
}));

vi.mock("@/features/account/data/cities.repository", () => ({
  cityQueries: {
    search: () => ({ queryKey: ["public", "cities"], queryFn: async () => [] }),
  },
}));

const { DetailsPage } = await import("../details-page");

/** The one moment this file is pinned to: Friday 4 September 2026, midday UTC. */
const NOW = "2026-09-04T12:00:00.000Z";

/**
 * A draft as `booking.byId` answers with one.
 *
 * `commissionBps` and `commissionMinor` are on the fixture **on purpose**,
 * even though `CheckoutBooking` omits them and the query never asks for them.
 * A fixture without them could not fail the "no commission on this page"
 * test: it would be asserting that a number nobody supplied is not rendered.
 */
function bookingFixture(over: Partial<BookingDTO> = {}): unknown {
  return {
    id: "bk-1",
    status: "DRAFT",
    serviceName: "Corte de cabelo",
    providerName: "Studio X",
    providerSlug: "studio-x",
    optionName: "Corte e barba",
    durationMinutes: 90,
    priceMinor: 90000,
    commissionBps: 1000,
    commissionMinor: 9000,
    currency: "MZN",
    startsAt: "2026-09-04T13:00:00.000Z",
    endsAt: "2026-09-04T14:30:00.000Z",
    addressLabel: null,
    addressLine: null,
    addressCity: null,
    addressDistrict: null,
    addressDirections: null,
    description: null,
    expiresAt: "2026-09-04T12:30:00.000Z",
    createdAt: NOW,
    ...over,
  };
}

function addressFixture(id: string, label: string, over: Partial<AddressDTO> = {}): AddressDTO {
  return {
    id,
    label,
    country: "MZ",
    city: "Maputo",
    district: "Polana",
    line1: "Av. Julius Nyerere 1234",
    line2: null,
    postalCode: null,
    directions: null,
    latitude: null,
    longitude: null,
    isDefault: false,
    ...over,
  };
}

function renderDetails({
  bookingId,
  booking = bookingFixture(),
  addresses = [addressFixture("addr-1", "Casa", { isDefault: true })],
  at,
}: {
  bookingId: string;
  /** `null` is what the server answers with for an id that is not this customer's. */
  booking?: unknown;
  addresses?: AddressDTO[];
  /** Where to start, when a test needs a URL other than the flow's own. */
  at?: string;
}) {
  fakes.booking = booking;
  fakes.addresses = addresses;
  fakes.addAddress.mockReset();

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const rootRoute = createRootRoute();
  const detailsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/booking/$bookingId/details",
    validateSearch: (search: Record<string, unknown>) =>
      search as { serviceId?: string; optionId?: string },
    component: function DetailsRoute() {
      const params = detailsRoute.useParams();
      return <DetailsPage bookingId={params.bookingId} />;
    },
  });
  // Every destination reachable from this page, registered so navigation is
  // asserted against the router's own resolved location rather than a mocked
  // `navigate` — the latter passes even when the `to`/`search` shape is wrong
  // in a way the mock does not care about. `/booking/$bookingId/confirm` is
  // step 3, which this slice does not build; the stub is what makes "and then
  // it moves on" assertable before it exists.
  const bookRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/book/$serviceId",
    validateSearch: (search: Record<string, unknown>) =>
      search as { expired?: boolean; optionId?: string },
    component: () => <p>choose when</p>,
  });
  const confirmRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/booking/$bookingId/confirm",
    validateSearch: (search: Record<string, unknown>) => search as { serviceId?: string },
    component: () => <p>confirm step</p>,
  });
  const servicesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/services",
    validateSearch: (search: Record<string, unknown>) => search as { category?: string },
    component: () => <p>services browse</p>,
  });
  const bookingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/bookings",
    component: () => <p>my bookings</p>,
  });

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      detailsRoute,
      bookRoute,
      confirmRoute,
      servicesRoute,
      bookingsRoute,
    ]),
    // The URL the flow actually arrives on: step 1 knows which service and
    // which package this draft was made from, and puts both here because the
    // booking read model carries neither.
    history: createMemoryHistory({
      initialEntries: [at ?? `/booking/${bookingId}/details?serviceId=svc-1&optionId=opt-2`],
    }),
  });

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return { router };
}

/**
 * The locale is pinned, not inherited.
 *
 * Every assertion below reads Portuguese copy, and the suite's default
 * resolves to English (`test/setup.ts` says so). A test that passed because
 * the default happened to be `pt-MZ` would fail the day the default changed,
 * for a reason with nothing to do with this page.
 *
 * The clock is pinned because the rail carries a countdown, and the fixture's
 * `expiresAt` has to mean thirty minutes rather than "some time in 2026".
 * The store is cleared because it outlives a test the way it outlives a page.
 */
beforeEach(async () => {
  await i18n.changeLanguage("pt-MZ");
  vi.setSystemTime(new Date(NOW));
  sessionStorage.clear();
});

afterEach(async () => {
  vi.useRealTimers();
  await i18n.changeLanguage("en-US");
});

describe("DetailsPage", () => {
  it("offers the add-address form when there are none saved", async () => {
    // An empty list with nothing to do next reads as broken. The customer
    // cannot proceed without an address, so the form IS the empty state.
    renderDetails({ bookingId: "bk-1", addresses: [] });
    expect(await screen.findByRole("form", { name: /nova morada/i })).toBeInTheDocument();
  });

  it("sends the customer back to step 1 when the draft has expired", async () => {
    const { router } = renderDetails({ bookingId: "bk-1", booking: null });
    // `waitFor`, unlike the brief's line: the booking travels a promise and
    // the redirect runs in an effect that reads it, so asserting the location
    // in the same tick as `render` is a race the page loses on a fast
    // machine. The choose-when suite awaits the identical redirect the same
    // way.
    await waitFor(() => expect(router.state.location.pathname).toBe("/book/svc-1"));
  });

  it("treats a lapsed draft the server still answers with as expired too", async () => {
    // **`null` is not how a hold running out arrives.** The sweep marks the
    // draft `EXPIRED` and it goes on belonging to its customer, so
    // `booking.byId` returns a row; `CreateBookingCommand` marks a superseded
    // draft the same way. A page that only watched for `null` would render
    // the form, under a countdown already at zero, for the single commonest
    // way this step fails.
    const { router } = renderDetails({
      bookingId: "bk-1",
      booking: bookingFixture({ status: "EXPIRED" }),
    });

    await waitFor(() => expect(router.state.location.pathname).toBe("/book/svc-1"));
    expect(router.state.location.search).toMatchObject({ expired: true, optionId: "opt-2" });
  });

  it("keeps the customer's package when it sends them back", async () => {
    // Going back without `optionId` restarts checkout on the service's
    // cheapest option rather than the package whose price they read — the
    // same silent downgrade step 1's own `optionId` exists to prevent.
    const { router } = renderDetails({ bookingId: "bk-1", booking: null });

    // Both inside one `waitFor`, and the path first. The URL this page
    // *starts* on already carries `optionId=opt-2`, so a lone search
    // assertion is satisfied before any navigation happens at all and would
    // pass with the redirect dropping the parameter entirely.
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/book/svc-1");
      expect(router.state.location.search).toMatchObject({ optionId: "opt-2" });
    });
  });

  it("carries the chosen address and the note to step 3 without writing them to the server", async () => {
    // The design's one-write-at-each-end rule. There is no `booking.update`
    // in this design, and the only mutation this page can reach is the
    // address book's own.
    renderDetails({
      bookingId: "bk-1",
      addresses: [
        addressFixture("addr-1", "Casa", { isDefault: true }),
        addressFixture("addr-2", "Escritório", { line1: "Rua da Sé 42" }),
      ],
    });

    await userEvent.click(await screen.findByRole("radio", { name: /Escritório/ }));
    await userEvent.type(screen.getByLabelText(/o que precisa de ser feito/i), "Portão azul");
    await userEvent.click(screen.getByRole("button", { name: /continuar/i }));

    expect(readDraftDetails("bk-1")).toEqual({
      addressId: "addr-2",
      description: "Portão azul",
    });
    expect(fakes.addAddress).not.toHaveBeenCalled();
  });

  it("moves on to step 3", async () => {
    const { router } = renderDetails({ bookingId: "bk-1" });
    await userEvent.click(await screen.findByRole("button", { name: /continuar/i }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/booking/bk-1/confirm"),
    );
    // Step 3 renders the same countdown, whose only way back to step 1 is
    // this id — the booking read model does not carry one.
    expect(router.state.location.search).toMatchObject({
      serviceId: "svc-1",
      optionId: "opt-2",
    });
  });

  it("keeps what the customer typed before they press anything", async () => {
    // The other half of surviving a reload: a page that only wrote on
    // continue would lose the note of somebody who refreshed mid-sentence,
    // and every assertion about the store would still pass.
    renderDetails({ bookingId: "bk-1" });

    await userEvent.type(
      await screen.findByLabelText(/o que precisa de ser feito/i),
      "Portão azul",
    );

    expect(readDraftDetails("bk-1")).toEqual({
      addressId: "addr-1",
      description: "Portão azul",
    });
  });

  it("opens on what the customer already typed", async () => {
    // The refresh case, from the page's side: the store is what makes a
    // reload of step 2 keep the address and the note.
    sessionStorage.setItem(
      "ntizo.checkout.bk-1",
      JSON.stringify({ addressId: "addr-2", description: "Portão azul" }),
    );

    renderDetails({
      bookingId: "bk-1",
      addresses: [
        addressFixture("addr-1", "Casa", { isDefault: true }),
        addressFixture("addr-2", "Escritório", { line1: "Rua da Sé 42" }),
      ],
    });

    expect(await screen.findByRole("radio", { name: /Escritório/ })).toBeChecked();
    expect(screen.getByLabelText(/o que precisa de ser feito/i)).toHaveValue("Portão azul");
  });

  it("never shows the customer a commission", async () => {
    // The commission comes out of the provider's payout. A breakdown here
    // would invent a fee the customer is not being charged — so the query
    // does not even ask for the fields, and nothing on the page prints them.
    renderDetails({ bookingId: "bk-1" });

    expect(await screen.findByText("900,00 MTn")).toBeInTheDocument();
    expect(screen.queryByText(/90,00\s*MTn/)).not.toBeInTheDocument();
    expect(screen.queryByText(/10\s*%/)).not.toBeInTheDocument();
  });

  it("shows the request rather than the form once it has been sent", async () => {
    // Reachable with the back button after step 3. `expiresAt` on a submitted
    // booking is the provider's response window, so a checkout countdown here
    // would be counting somebody else's deadline, and a continue button would
    // lead to a mutation that has already run.
    renderDetails({
      bookingId: "bk-1",
      booking: bookingFixture({ status: "AWAITING_PROVIDER" }),
    });

    expect(await screen.findByText(/já foi enviado/i)).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });

  it("browses rather than guessing when the URL carries no service", async () => {
    // A hand-typed or long-stale link. Sending the customer to `/book/` with
    // an empty id, or picking a service for them, would both be worse than
    // saying "here is everything".
    const { router } = renderDetails({
      bookingId: "bk-1",
      booking: null,
      at: "/booking/bk-1/details",
    });

    await waitFor(() => expect(router.state.location.pathname).toBe("/services"));
  });
});
