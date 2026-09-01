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
  /** The address book refusing to answer — a transient failure, not an empty list. */
  addressesFail: false,
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
    mine: () => ({
      queryKey: ["user", "addresses"],
      queryFn: async () => {
        if (fakes.addressesFail) throw new Error("address book unreachable");
        return fakes.addresses;
      },
    }),
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
    serviceId: "svc-1",
    serviceOptionId: "opt-2",
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
    // The service's own zone. This page prints no slot, but the panel it
    // shows for a booking that has already been sent prints the provider's
    // deadline — and a deadline formatted in the machine's zone is a test
    // whose answer depends on where it runs.
    timezone: "Africa/Maputo",
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
  addressesFail = false,
}: {
  bookingId: string;
  /** `null` is what the server answers with for an id that is not this customer's. */
  booking?: unknown;
  addresses?: AddressDTO[];
  /** The address book refusing to answer, which is not the same as answering with nothing. */
  addressesFail?: boolean;
}) {
  fakes.booking = booking;
  fakes.addresses = addresses;
  fakes.addressesFail = addressesFail;
  fakes.addAddress.mockReset();

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const rootRoute = createRootRoute();
  const detailsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/booking/$bookingId/details",
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
    // The URL the flow actually arrives on. The booking id is the whole
    // address: the service and the package come off the booking itself, so
    // there is nothing else here for a shared link to get wrong.
    history: createMemoryHistory({ initialEntries: [`/booking/${bookingId}/details`] }),
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
  // The storage case spies on `Storage.prototype`, which is shared by every
  // test in the file — left in place it would make the next one look like a
  // private window.
  vi.restoreAllMocks();
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

    // `waitFor`, unlike the brief's line: the booking travels a promise and
    // the redirect runs in an effect that reads it, so asserting the location
    // in the same tick as `render` is a race the page loses on a fast
    // machine. The choose-when suite awaits the identical redirect the same
    // way.
    await waitFor(() => expect(router.state.location.pathname).toBe("/book/svc-1"));
    // Both off the booking. The URL this page was reached by carries neither,
    // so a service or a package on the far side of this redirect can only
    // have come from the row.
    expect(router.state.location.search).toMatchObject({ expired: true, optionId: "opt-2" });
  });

  it("keeps the customer's package when it sends them back", async () => {
    // Going back without the option restarts checkout on the service's
    // cheapest package rather than the one whose price they read — the same
    // silent downgrade step 1's own `optionId` exists to prevent. A distinct
    // id here, so this cannot pass on the fixture's default.
    const { router } = renderDetails({
      bookingId: "bk-1",
      booking: bookingFixture({ status: "EXPIRED", serviceOptionId: "opt-9" }),
    });

    // Both inside one `waitFor`, and the path first: a lone search assertion
    // can be satisfied before any navigation has happened at all.
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/book/svc-1");
      expect(router.state.location.search).toMatchObject({ optionId: "opt-9" });
    });
  });

  it("browses rather than guessing when the booking is not the customer's to read", async () => {
    // `null` is how the server answers for somebody else's booking and for an
    // id that never named one, undistinguished on purpose. It cannot mean
    // "back to step 1 with the service kept", because there is no service to
    // keep — reconstructing step 1 for a booking we are not allowed to see is
    // how a fallback becomes a leak.
    const { router } = renderDetails({ bookingId: "bk-1", booking: null });

    await waitFor(() => expect(router.state.location.pathname).toBe("/services"));
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

  it("moves on to step 3 with the booking id and nothing else", async () => {
    const { router } = renderDetails({ bookingId: "bk-1" });
    await userEvent.click(await screen.findByRole("button", { name: /continuar/i }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/booking/bk-1/confirm"),
    );
    // Step 3 loads the same booking, which carries its own service and
    // option. A copy in the URL would be a second source for one fact.
    expect(router.state.location.search).toEqual({});
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

  it("says so when the browser will not keep what is typed", async () => {
    // A private window, or a store at its quota. `sessionStorage` is the only
    // channel between this page and step 3, so a form here would take an
    // address and lose it at the confirm with nothing on screen to explain
    // where it went. The probe writes rather than reads — a read succeeds
    // against a full store.
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    renderDetails({ bookingId: "bk-1" });

    expect(await screen.findByText(/não guarda os seus dados/i)).toBeInTheDocument();
    // Not a warning printed above a form that still takes an answer.
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/o que precisa de ser feito/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continuar/i })).toBeDisabled();
  });

  it("shows the request rather than the form once it has been sent", async () => {
    // Reachable with the back button after step 3. `expiresAt` on a submitted
    // booking is the provider's response window, so a checkout countdown here
    // would be counting somebody else's deadline, and a continue button would
    // lead to a mutation that has already run.
    //
    // **The same panel step 3 shows, with the same deadline in it.** 12:30 UTC
    // is 14:30 in Maputo. The two steps are one back-press apart and used to
    // answer this booking differently — step 3 named the deadline, step 2 said
    // only that the provider would answer "assim que puder".
    renderDetails({
      bookingId: "bk-1",
      booking: bookingFixture({ status: "AWAITING_PROVIDER", addressLabel: "Casa" }),
    });

    expect(await screen.findByText(/pedido enviado/i)).toBeInTheDocument();
    expect(screen.getByText(/14:30/)).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });

  it("does not mistake a request nobody answered for a lapsed hold", async () => {
    // **`EXPIRED` means two different things**, and this page can meet both.
    // `BookingStatus.Expired` covers a DRAFT whose checkout hold passed *and*
    // an AWAITING_PROVIDER whose response window did — `SweepBookingCommand`
    // writes it for both — so a status check alone answers "nobody replied to
    // you" by sending the customer back to step 1 to pick another time.
    //
    // Step 3 is where that case is normally met, but this page is one
    // back-press from it, and with `accept` and `decline` unmounted this
    // phase a lapsed response window is the ordinary end state of a request
    // rather than an unusual one. **Same case, and now the same answer**: this
    // page used to catch it and then hand it step 3's opposite sentence, so a
    // customer who read "o prestador não respondeu a tempo" and pressed back
    // was told "o prestador responde-lhe assim que puder" about the same row.
    //
    // The discriminator is the address: null on a DRAFT and only on a DRAFT,
    // because `Booking.submit` refuses to leave DRAFT without one. So this
    // fixture — expired *with* an address — is the one the whole distinction
    // rests on, and without it reverting `checkoutOutcome`'s `EXPIRED` case to
    // a bare "released" leaves this file green.
    const { router } = renderDetails({
      bookingId: "bk-1",
      booking: bookingFixture({
        status: "EXPIRED",
        addressLabel: "Casa",
        addressLine: "Av. Julius Nyerere 1234",
        addressCity: "Maputo",
      }),
    });

    expect(await screen.findByText(/não respondeu a tempo/i)).toBeInTheDocument();
    // Word for word what step 3 says about the identical booking.
    expect(screen.getByText(/não foi cobrado nada/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /escolher outra hora/i })).toBeInTheDocument();
    // Stays put. The redirect is what made the loss invisible, and the
    // sibling assertions above prove this same page *does* redirect a draft
    // whose hold genuinely lapsed.
    expect(router.state.location.pathname).toBe("/booking/bk-1/details");
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("tells a customer whose provider accepted that the payment prompt is waiting", async () => {
    // **The sharp one.** An operator hand-accepts a request — the stated mode
    // this phase — the charge sweep pushes an M-Pesa prompt, and the payment
    // window starts. This page used to answer that with "já não há nada para
    // preencher aqui; o prestador responde-lhe assim que puder". A customer
    // who believes it does nothing, the window closes, the booking is
    // CANCELLED, and the provider is told the customer did not pay.
    renderDetails({
      bookingId: "bk-1",
      booking: bookingFixture({ status: "PENDING_PAYMENT", addressLabel: "Casa" }),
    });

    expect(await screen.findByText(/falta pagar/i)).toBeInTheDocument();
    expect(screen.getByText(/M-Pesa/)).toBeInTheDocument();
    // Not "the provider will answer as soon as they can" — they already have.
    expect(screen.queryByText(/assim que puder/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("says the provider declined rather than that they are still thinking", async () => {
    renderDetails({
      bookingId: "bk-1",
      booking: bookingFixture({ status: "DECLINED", addressLabel: "Casa" }),
    });

    expect(await screen.findByText(/não aceitou o pedido/i)).toBeInTheDocument();
    expect(screen.getByText(/não foi cobrado nada/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /escolher outra hora/i })).toBeInTheDocument();
  });

  it("falls back to a real address when the stored one has been deleted", async () => {
    // Pick an address on this page, delete it from `/account/addresses` in the
    // same tab, come back. The stored id survives in `sessionStorage` and
    // names nothing the list can draw, so the radio group rendered with
    // **nothing checked beside a live continue** — which sent the customer to
    // step 3, which found no address and sent them straight back here, which
    // restored the same dead id. Escapable only by noticing they had to click
    // a radio, with nothing on screen saying so and the hold counting down.
    sessionStorage.setItem(
      "ntizo.checkout.bk-1",
      JSON.stringify({ addressId: "addr-gone", description: "Portão azul" }),
    );

    renderDetails({
      bookingId: "bk-1",
      addresses: [
        addressFixture("addr-1", "Casa", { isDefault: true }),
        addressFixture("addr-2", "Escritório", { line1: "Rua da Sé 42" }),
      ],
    });

    // The address book's default, which is the answer the customer already
    // gave for "assume this one".
    expect(await screen.findByRole("radio", { name: /Casa/ })).toBeChecked();
    const proceed = screen.getByRole("button", { name: /continuar/i });
    expect(proceed).toBeEnabled();

    await userEvent.click(proceed);
    // And the dead id is gone from the store, so step 3 is handed something
    // it can actually send.
    expect(readDraftDetails("bk-1")).toEqual({
      addressId: "addr-1",
      description: "Portão azul",
    });
  });

  it("says the address book could not be read rather than offering to add one", async () => {
    // **An errored list is not an empty one.** A customer with three saved
    // addresses hitting a transient failure was shown the add-address form —
    // the empty state — and either typed a duplicate of an address they
    // already had or pressed a continue that bounced them off step 3.
    renderDetails({ bookingId: "bk-1", addressesFail: true });

    expect(await screen.findByText(/não foi possível carregar as suas moradas/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /tentar de novo/i })).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: /nova morada/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /acrescentar morada/i })).not.toBeInTheDocument();
    // Nothing to select, so nothing to continue with.
    expect(screen.getByRole("button", { name: /continuar/i })).toBeDisabled();
  });
});
