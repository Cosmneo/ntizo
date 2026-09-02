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
import type { AddressDTO, CurrentUserDTO } from "@ntizo/shared";
import type { BookingDTO } from "@ntizo/shared/read-models";
import i18n from "@/shared/lib/i18n";
import { readDraftDetails } from "@/features/checkout/domain/draft-store";

/**
 * Every read is mocked at the **data** layer, so the real viewmodels run.
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
 * `user.me` is mocked because the phone field opens on the number already on
 * the profile — the page reads it live rather than being handed one.
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
  user: null as unknown,
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

vi.mock("@/features/user/data/user.repository", () => ({
  userQueries: {
    me: () => ({ queryKey: ["user", "me"], queryFn: async () => fakes.user }),
  },
  updateMyProfile: vi.fn(),
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
 * **Typed as a whole `BookingDTO` rather than cast through `unknown`**, which
 * is follow-up #116 closed: the old shape took a `Partial<BookingDTO>` and
 * returned `unknown`, so a field added to `bookingReadModel` never broke it.
 * `providerVerified` and `providerRatingAverage` were added and this fixture
 * compiled unchanged, describing a booking the API no longer returned — a
 * passing test asserting against a shape reality had left behind, which reads
 * as coverage. The compiler is now the thing that notices.
 *
 * `commissionBps` and `commissionMinor` come with the type, and that matters
 * for one test in particular: a fixture without them could not fail the "no
 * commission on this page" case, because it would be asserting that a number
 * nobody supplied is not rendered.
 *
 * The rating is **4.2 and not 4.8 or 5**: it has to be a value no default and
 * no other fixture in this repo would produce, or the trust-line assertion
 * passes against a rail that ignored the booking entirely.
 */
function bookingFixture(over: Partial<BookingDTO> = {}): BookingDTO {
  return {
    id: "bk-1",
    status: "DRAFT",
    serviceId: "svc-1",
    serviceOptionId: "opt-2",
    serviceName: "Corte de cabelo",
    providerName: "Studio X",
    providerSlug: "studio-x",
    providerVerified: true,
    providerRatingAverage: 4.2,
    optionName: "Corte e barba",
    durationMinutes: 90,
    priceMinor: 90000,
    commissionBps: 1000,
    commissionMinor: 9000,
    currency: "MZN",
    startsAt: "2026-09-04T13:00:00.000Z",
    endsAt: "2026-09-04T14:30:00.000Z",
    // The service's own zone. 13:00 UTC is 15:00 in Maputo, and this page
    // prints the slot twice — in the panel above the form and in the rail —
    // so a clock read off the machine would tell the customer a different
    // appointment to the one the provider is expecting them for.
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

/**
 * The signed-in customer.
 *
 * **`phoneNumber` is null by default, and that is what keeps this suite
 * deterministic.** The field is derived from `typed ?? profile ?? ""`, and a
 * profile number arriving a render or two after mount would race every
 * assertion about what the store holds. Every case that presses continue
 * therefore types a number; the one case about opening on a saved number
 * overrides this.
 */
function userFixture(over: Partial<CurrentUserDTO> = {}): CurrentUserDTO {
  return {
    id: "cust-1",
    email: "cliente@ntizo.test",
    role: "customer",
    status: "active",
    createdAt: NOW,
    name: "Ana Cossa",
    firstName: "Ana",
    lastName: "Cossa",
    displayName: "Ana",
    avatarUrl: null,
    avatarKey: null,
    phoneNumber: null,
    bio: null,
    language: "pt-MZ",
    timezone: "Africa/Maputo",
    dateOfBirth: null,
    gender: null,
    ...over,
  };
}

function renderDetails({
  bookingId,
  booking = bookingFixture(),
  addresses = [addressFixture("addr-1", "Casa", { isDefault: true })],
  addressesFail = false,
  user = userFixture(),
}: {
  bookingId: string;
  /** `null` is what the server answers with for an id that is not this customer's. */
  booking?: BookingDTO | null;
  addresses?: AddressDTO[];
  /** The address book refusing to answer, which is not the same as answering with nothing. */
  addressesFail?: boolean;
  user?: CurrentUserDTO;
}) {
  fakes.booking = booking;
  fakes.addresses = addresses;
  fakes.addressesFail = addressesFail;
  fakes.user = user;
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
  // in a way the mock does not care about.
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

/** The phone field, by the label the customer reads. */
function phoneField(): HTMLElement {
  return screen.getByLabelText(/telem[oó]vel/i);
}

/** Open the saved-address chooser, which is collapsed once an address is settled on. */
async function openAddressChooser() {
  await userEvent.click(screen.getByRole("button", { name: /alterar morada/i }));
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

  it("opens on the add-address form when step 1 said 'outro endereço'", async () => {
    // **`null` is a positive answer, not an absence.** Step 1 records "outro
    // endereço" that way, and answering it with the address book's default
    // would overrule a customer who has already said they will give a
    // different address — and send the provider somewhere they did not ask
    // for.
    sessionStorage.setItem(
      "ntizo.checkout.bk-1",
      JSON.stringify({ addressId: null, description: "", phoneNumber: null }),
    );

    renderDetails({
      bookingId: "bk-1",
      addresses: [addressFixture("addr-1", "Casa", { isDefault: true })],
    });

    expect(await screen.findByRole("form", { name: /nova morada/i })).toBeInTheDocument();
    // And nothing is silently selected behind it: a live continue here would
    // carry "Casa" to step 3 while the customer typed a different address.
    expect(screen.getByRole("radio", { name: /Casa/ })).not.toBeChecked();
    expect(screen.getByRole("button", { name: /continuar/i })).toBeDisabled();
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

  it("carries the chosen address, the note and the number to step 3 without writing them to the server", async () => {
    // The design's one-write-at-each-end rule. There is no `booking.update`
    // in this design, and the only mutation this page can reach is the
    // address book's own — the phone is written by step 3, not here.
    renderDetails({
      bookingId: "bk-1",
      addresses: [
        addressFixture("addr-1", "Casa", { isDefault: true }),
        addressFixture("addr-2", "Escritório", { line1: "Rua da Sé 42" }),
      ],
    });

    // The chooser is collapsed once an address is settled on — the resting
    // state reads back "Endereço / Bairro" rather than a radio list.
    await waitFor(() => expect(screen.getByText("Av. Julius Nyerere 1234")).toBeInTheDocument());
    await openAddressChooser();
    await userEvent.click(screen.getByRole("radio", { name: /Escritório/ }));
    await userEvent.type(screen.getByLabelText(/o que precisa de ser feito/i), "Portão azul");
    await userEvent.type(phoneField(), "841234567");
    await userEvent.click(screen.getByRole("button", { name: /continuar/i }));

    expect(readDraftDetails("bk-1")).toEqual({
      addressId: "addr-2",
      description: "Portão azul",
      phoneNumber: "841234567",
    });
    expect(fakes.addAddress).not.toHaveBeenCalled();
  });

  it("moves on to step 3 with the booking id and nothing else", async () => {
    const { router } = renderDetails({ bookingId: "bk-1" });
    await userEvent.type(await screen.findByLabelText(/telem[oó]vel/i), "841234567");
    await userEvent.click(screen.getByRole("button", { name: /continuar/i }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/booking/bk-1/confirm"),
    );
    // Step 3 loads the same booking, which carries its own service and
    // option. A copy in the URL would be a second source for one fact.
    expect(router.state.location.search).toEqual({});
  });

  it("refuses a number M-Pesa cannot reach, with the same rule the charge uses", async () => {
    // **`82` is a real Mozambican prefix and not Vodacom's**, so it is the
    // value a laxer browser rule — a length check, a `/^8\d{8}$/` — would
    // wave through. Accepted here it fails at the charge instead, after the
    // provider has already blocked their calendar for it. Never tested with
    // `"abc"`: that refusal proves nothing about the rule the money uses.
    renderDetails({ bookingId: "bk-1" });

    await userEvent.type(await screen.findByLabelText(/telem[oó]vel/i), "821234567");
    await userEvent.click(screen.getByRole("button", { name: /continuar/i }));

    expect(await screen.findByText(/n[uú]mero.*Vodacom/i)).toBeInTheDocument();
    // And it goes no further: step 3 would have nothing to fix it with.
    expect(readDraftDetails("bk-1")?.phoneNumber).toBe("821234567");
  });

  it("stays put on a number M-Pesa cannot reach", async () => {
    // The half of the refusal a message on screen does not prove. Split from
    // the case above so a page that printed the sentence *and* navigated
    // fails one of the two rather than passing both.
    const { router } = renderDetails({ bookingId: "bk-1" });

    await userEvent.type(await screen.findByLabelText(/telem[oó]vel/i), "821234567");
    await userEvent.click(screen.getByRole("button", { name: /continuar/i }));

    await screen.findByText(/n[uú]mero.*Vodacom/i);
    expect(router.state.location.pathname).toBe("/booking/bk-1/details");
  });

  it("accepts a number typed the way people type one", async () => {
    // Spaces are how a Mozambican writes a phone number, and `toMpesaMsisdn`
    // strips separators before deciding. A page that validated the raw string
    // would refuse a perfectly good handset for a habit of punctuation.
    const { router } = renderDetails({ bookingId: "bk-1" });

    await userEvent.type(await screen.findByLabelText(/telem[oó]vel/i), "+258 84 123 4567");
    await userEvent.click(screen.getByRole("button", { name: /continuar/i }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/booking/bk-1/confirm"));
  });

  it("refuses an empty number rather than moving on", async () => {
    // `booking.submit` refuses a customer with none on file, so continuing
    // here buys them a page whose only outcome is a refusal — and step 3 no
    // longer has a field to correct it in.
    const { router } = renderDetails({ bookingId: "bk-1" });

    await userEvent.click(await screen.findByRole("button", { name: /continuar/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/booking/bk-1/details");
  });

  it("opens on the number already on the profile", async () => {
    // The commonest case is a customer who has one: retyping a number the
    // platform already holds is work asked of them for nothing.
    renderDetails({
      bookingId: "bk-1",
      user: userFixture({ phoneNumber: "+258845550101" }),
    });

    await waitFor(() => expect(phoneField()).toHaveValue("+258845550101"));
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
    await userEvent.type(phoneField(), "841234567");

    expect(readDraftDetails("bk-1")).toEqual({
      addressId: "addr-1",
      description: "Portão azul",
      phoneNumber: "841234567",
    });
  });

  it("opens on what the customer already typed", async () => {
    // The refresh case, from the page's side: the store is what makes a
    // reload of step 2 keep the address, the note and the number.
    sessionStorage.setItem(
      "ntizo.checkout.bk-1",
      JSON.stringify({
        addressId: "addr-2",
        description: "Portão azul",
        phoneNumber: "845550101",
      }),
    );

    renderDetails({
      bookingId: "bk-1",
      addresses: [
        addressFixture("addr-1", "Casa", { isDefault: true }),
        addressFixture("addr-2", "Escritório", { line1: "Rua da Sé 42" }),
      ],
    });

    // The stored address, not the address book's default.
    expect(await screen.findByText("Rua da Sé 42")).toBeInTheDocument();
    expect(screen.getByLabelText(/o que precisa de ser feito/i)).toHaveValue("Portão azul");
    // The stored number beats the profile's, which is empty here — and would
    // beat one that was not: what they typed on this checkout is the number
    // they expect the prompt on.
    expect(phoneField()).toHaveValue("845550101");
  });

  it("prints the provider's score and badge off the booking", async () => {
    // The rail's trust line, `Studio X · 4,2 ★ · Verificado`. Both halves
    // come from `bookingReadModel` and are read live rather than snapshotted:
    // they are not terms of the booking, and a badge frozen at draft time
    // would go on claiming a document the platform has since withdrawn.
    renderDetails({ bookingId: "bk-1" });

    expect(await screen.findByText("Studio X")).toBeInTheDocument();
    // "4,2" in `pt-MZ` — the reader's own decimal separator, and a value no
    // default would produce.
    expect(screen.getByText("4,2")).toBeInTheDocument();
    expect(screen.getByText("Verificado")).toBeInTheDocument();
  });

  it("says nothing about a score or a badge the booking does not carry", async () => {
    // Null is never 0: zero is a score a person could have given, and
    // printing it would tell the customer this is the worst provider on the
    // platform. Paired with the case above so a hardcoded line fails one of
    // the two.
    renderDetails({
      bookingId: "bk-1",
      booking: bookingFixture({ providerRatingAverage: null, providerVerified: false }),
    });

    expect(await screen.findByText("Studio X")).toBeInTheDocument();
    expect(screen.queryByText("4,2")).not.toBeInTheDocument();
    expect(screen.queryByText("0,0")).not.toBeInTheDocument();
    expect(screen.queryByText("Verificado")).not.toBeInTheDocument();
  });

  it("reads the slot back in the service's zone, not the device's", async () => {
    // 13:00 UTC is 15:00 in Maputo, and it is the provider's clock the
    // customer will be standing in front of. Printed in the browser's zone
    // this page would name a different appointment to the one they are about
    // to ask for — the same substitution that drew step 1 an empty grid under
    // a live confirm button, arriving one page later with nothing on screen
    // to reveal it.
    renderDetails({ bookingId: "bk-1" });

    // Twice: the panel above the form and the rail beside it both print it,
    // and they must agree — two clocks on one page make whichever the
    // customer checks against the other look wrong.
    await waitFor(() => expect(screen.getAllByText(/15:00 – 16:30/)).toHaveLength(2));
  });

  it("reads a second service's slot in that service's zone too", async () => {
    // The pair is what makes the case above device-independent. A machine's
    // own zone can coincide with at most one of `Africa/Maputo` and
    // `Pacific/Auckland`, so wherever this suite runs, at least one of these
    // two is asserting a time the browser would not have produced on its own.
    renderDetails({
      bookingId: "bk-1",
      booking: bookingFixture({ timezone: "Pacific/Auckland" }),
    });

    await waitFor(() => expect(screen.getAllByText(/01:00 – 02:30/)).toHaveLength(2));
  });

  it("never shows the customer a commission", async () => {
    // The commission comes out of the provider's payout. A breakdown here
    // would invent a fee the customer is not being charged — so the query
    // does not even ask for the fields, and nothing on the page prints them.
    renderDetails({ bookingId: "bk-1" });

    await screen.findByText("Studio X");
    // **Every amount on the page, listed.** Not `queryByText("90,00")`: an
    // exact-match query cannot see "90,00 MTn", which is what a commission
    // line would actually render, and the rail's own suite demonstrated that
    // version staying green with a real commission line injected. Two
    // amounts, both the package's own — the service line and the total.
    const amounts = screen
      .getAllByText(/MTn/)
      .map((node) => (node.textContent ?? "").replace(/\s+/g, " ").trim());
    expect(amounts).toEqual(["900,00 MTn", "900,00 MTn"]);
    expect(screen.queryByText(/comiss/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/taxa/i)).not.toBeInTheDocument();
  });

  it("says so when the browser will not keep what is typed", async () => {
    // A private window, or a store at its quota. `sessionStorage` is the only
    // channel between this page and step 3, so a form here would take an
    // address and a number and lose them at the confirm with nothing on
    // screen to explain where they went. The probe writes rather than reads —
    // a read succeeds against a full store.
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    renderDetails({ bookingId: "bk-1" });

    expect(await screen.findByText(/não guarda os seus dados/i)).toBeInTheDocument();
    // Not a warning printed above a form that still takes an answer.
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/o que precisa de ser feito/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/telem[oó]vel/i)).not.toBeInTheDocument();
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
    expect(screen.queryByLabelText(/telem[oó]vel/i)).not.toBeInTheDocument();
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
    // names nothing the list can draw, so the page rendered **nothing chosen
    // beside a live continue** — which sent the customer to step 3, which
    // found no address and sent them straight back here, which restored the
    // same dead id. Escapable only by noticing they had to pick again, with
    // nothing on screen saying so and the hold counting down.
    sessionStorage.setItem(
      "ntizo.checkout.bk-1",
      JSON.stringify({
        addressId: "addr-gone",
        description: "Portão azul",
        phoneNumber: "841234567",
      }),
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
    expect(await screen.findByText("Av. Julius Nyerere 1234")).toBeInTheDocument();
    const proceed = screen.getByRole("button", { name: /continuar/i });
    expect(proceed).toBeEnabled();

    await userEvent.click(proceed);
    // And the dead id is gone from the store, so step 3 is handed something
    // it can actually send.
    expect(readDraftDetails("bk-1")).toEqual({
      addressId: "addr-1",
      description: "Portão azul",
      phoneNumber: "841234567",
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
