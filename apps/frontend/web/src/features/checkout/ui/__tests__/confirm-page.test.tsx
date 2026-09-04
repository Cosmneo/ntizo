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
import { GraphqlError } from "@/shared/lib/graphql/session-graphql";
import {
  saveDraftDetails,
  type DraftDetails,
} from "@/features/checkout/domain/draft-store";

/**
 * Every read and every write is mocked at the **data** layer, so the real
 * viewmodels run.
 *
 * That is what makes the order assertion mean anything. `useSendBookingRequest`
 * is where the two mutations are sequenced; a mocked viewmodel handed a
 * ready-made `send` would assert nothing about the sequencing, which is the
 * one behaviour of this page the design argues about at length. `vi.mock`
 * names a module rather than importing one, so no `ui -> data` edge is created
 * and `boundaries/dependencies` stays satisfied — the same choice steps 1 and
 * 2 document for the same rule.
 *
 * `calls` is a single array both fakes push into, because "in that order" is a
 * fact about the two of them together and two separate spies can only be
 * compared by their invocation timestamps.
 */
const fakes = vi.hoisted(() => {
  const calls: string[] = [];
  return {
    calls,
    booking: null as unknown,
    addresses: [] as AddressDTO[],
    user: null as unknown,
    updateMyProfile: vi.fn(async (_input: unknown) => {
      calls.push("user.updateMyProfile");
    }),
    submitBooking: vi.fn(async (_input: unknown) => {
      calls.push("booking.submit");
      return { bookingId: "bk-1", respondBy: "2026-09-04T14:00:00.000Z" };
    }),
  };
});

vi.mock("@/features/checkout/data/checkout.repository", () => ({
  bookingQueries: {
    byId: (bookingId: string) => ({
      queryKey: ["booking", bookingId],
      queryFn: async () => fakes.booking,
    }),
  },
  createBooking: vi.fn(),
  submitBooking: fakes.submitBooking,
}));

vi.mock("@/features/account/data/address.repository", () => ({
  addressQueries: {
    mine: () => ({ queryKey: ["user", "addresses"], queryFn: async () => fakes.addresses }),
  },
  addAddress: vi.fn(),
  updateAddress: vi.fn(),
  deleteAddress: vi.fn(),
}));

vi.mock("@/features/user/data/user.repository", () => ({
  userQueries: {
    me: () => ({ queryKey: ["user", "me"], queryFn: async () => fakes.user }),
  },
  updateMyProfile: fakes.updateMyProfile,
}));

const { ConfirmPage } = await import("../confirm-page");

const submitSpy = fakes.submitBooking;
const calls = fakes.calls;

/** The one moment this file is pinned to: Friday 4 September 2026, midday UTC. */
const NOW = "2026-09-04T12:00:00.000Z";

/**
 * A draft as `booking.byId` answers with one.
 *
 * **The slot deliberately straddles midnight UTC.** 22:30 UTC on the 4th is
 * 00:30 on the *5th* in `Africa/Maputo` and 10:30 on the 5th in
 * `Pacific/Auckland` — so a page that formatted these instants in the
 * machine's own zone would print a different day and a different hour to the
 * one the provider is expecting the customer for. A fixture at midday could
 * not fail that way.
 *
 * **Typed as a whole `BookingDTO` rather than cast through `unknown`**, which
 * is follow-up #116 closed: the old shape took a `Partial<BookingDTO>` and
 * returned `unknown`, so a field added to `bookingReadModel` never broke it.
 * `providerVerified` and `providerRatingAverage` were added and this fixture
 * compiled unchanged, describing a booking the API no longer returned — a
 * passing test asserting against a shape reality had left behind, which reads
 * as coverage. The compiler is now the thing that notices.
 *
 * There is no `commissionBps`/`commissionMinor` to carry any more: both left
 * `bookingReadModel` itself on 2026-09-03. The "no commission on this page"
 * case below no longer needs either on this fixture — it still injects a
 * real `commissionMinor` at runtime, through `renderConfirm`'s own override
 * rather than through this typed literal, which is what proves the page
 * does not render one even if the untyped edge the mock sits behind ever
 * carried it.
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
    // Read live off the provider rather than snapshotted — and printed here
    // now that this page renders the shared rail. 4,2 rather than the rail
    // suite's own 4,8: no default and no other fixture in the repo produces
    // it, so the trust-line assertion cannot pass against a rail that ignored
    // the booking and printed a constant.
    providerVerified: true,
    providerRatingAverage: 4.2,
    optionName: "Corte e barba",
    durationMinutes: 90,
    // **`at_provider`, which is deliberately not the branch the rail draws
    // its extra line from.** The rail prints "Deslocação — Incluída" only
    // where the *provider* travels — `at_customer` and `flexible` — so a
    // fixture on one of those could not tell a page that reads the booking
    // apart from one that hardcodes the interesting case, and neither could
    // it fail if the line stopped being conditional. The tests that want the
    // travel line override this to `at_customer`.
    locationType: "at_provider",
    priceMinor: 90000,
    currency: "MZN",
    startsAt: "2026-09-04T22:30:00.000Z",
    endsAt: "2026-09-05T00:00:00.000Z",
    timezone: "Africa/Maputo",
    addressLabel: null,
    addressLine: null,
    addressCity: null,
    addressDistrict: null,
    addressDirections: null,
    description: null,
    expiresAt: "2026-09-04T12:30:00.000Z",
    paidAt: null,
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

function renderConfirm({
  bookingId,
  booking = bookingFixture(),
  addresses = [addressFixture("addr-1", "Casa", { isDefault: true })],
  user = userFixture(),
  /**
   * What step 2 left in the tab's store — the address, the note **and the
   * number**, which is where the phone field went. `undefined` means "seed
   * the usual thing"; `null` means the store is genuinely empty, which is how
   * a customer who typed this URL straight in arrives.
   */
  details = {
    addressId: "addr-1",
    description: "Portão azul",
    phoneNumber: "841234567",
  } as DraftDetails | null,
  priceMinor,
  commissionMinor,
}: {
  bookingId: string;
  /** `null` is what the server answers with for an id that is not this customer's. */
  booking?: BookingDTO | null;
  addresses?: AddressDTO[];
  user?: CurrentUserDTO;
  details?: DraftDetails | null;
  priceMinor?: number;
  commissionMinor?: number;
}) {
  fakes.booking =
    booking && (priceMinor !== undefined || commissionMinor !== undefined)
      ? {
          ...booking,
          ...(priceMinor !== undefined ? { priceMinor } : {}),
          ...(commissionMinor !== undefined ? { commissionMinor } : {}),
        }
      : booking;
  fakes.addresses = addresses;
  fakes.user = user;
  fakes.updateMyProfile.mockClear();
  fakes.submitBooking.mockClear();
  calls.length = 0;

  if (details) saveDraftDetails(bookingId, details);

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const rootRoute = createRootRoute();
  const confirmRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/booking/$bookingId/confirm",
    component: function ConfirmRoute() {
      const params = confirmRoute.useParams();
      return <ConfirmPage bookingId={params.bookingId} />;
    },
  });
  // Every destination reachable from this page, registered so navigation is
  // asserted against the router's own resolved location rather than a mocked
  // `navigate` — the latter passes even when the `to`/`search` shape is wrong
  // in a way the mock does not care about.
  const stub = (path: string, label: string) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path,
      validateSearch: (search: Record<string, unknown>) => search,
      component: () => <p>{label}</p>,
    });

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      confirmRoute,
      stub("/book/$serviceId", "choose when"),
      stub("/booking/$bookingId/details", "details step"),
      stub("/services", "services browse"),
      stub("/bookings", "my bookings"),
    ]),
    // The URL the flow actually arrives on. The booking id is the whole
    // address: the service, the package, the price and the slot's zone all
    // come off the booking itself.
    history: createMemoryHistory({ initialEntries: [`/booking/${bookingId}/confirm`] }),
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
 * `expiresAt` has to mean thirty minutes rather than "some time in 2026". The
 * store is cleared because it outlives a test the way it outlives a page.
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

describe("ConfirmPage", () => {
  it("applies the charge's own rule to what step 2 stored, rather than trusting it", async () => {
    // **The field moved to step 2; the rule did not stop applying here.**
    // `sessionStorage` is a string anybody with a console open can rewrite,
    // and a bookmarked confirm URL never went through step 2 at all. `82` is
    // a real Mozambican prefix and not Vodacom's — the value a laxer check
    // would wave through, and one the charge would fail on later, after the
    // provider had blocked their calendar.
    const { router } = renderConfirm({
      bookingId: "bk-1",
      details: { addressId: "addr-1", description: "", phoneNumber: "821234567" },
    });

    // Back to the step that owns the field, because this page no longer has
    // one to correct it in.
    await waitFor(() => expect(router.state.location.pathname).toBe("/booking/bk-1/details"));
    expect(submitSpy).not.toHaveBeenCalled();
    expect(fakes.updateMyProfile).not.toHaveBeenCalled();
  });

  it("no longer asks for the number it is about to charge", async () => {
    // The move itself. Step 2 collects it; a second field here would be a
    // second answer to one question, and the one further from the address it
    // travels with.
    renderConfirm({ bookingId: "bk-1" });

    await screen.findByRole("button", { name: /enviar pedido/i });
    expect(screen.queryByLabelText(/telem[oó]vel/i)).not.toBeInTheDocument();
    // Read back instead, so a wrong number is visible on the last screen
    // before a commitment.
    expect(screen.getByText("841234567")).toBeInTheDocument();
  });

  it("saves the phone before submitting, in that order", async () => {
    // Two mutations, not one: setting a phone number is the User context's
    // job. If the second fails the phone is still saved, which is recoverable
    // and not wrong. **Both still happen here**, on the page that sends the
    // request — moving the field to step 2 moved a control, not a write.
    renderConfirm({ bookingId: "bk-1" });
    await userEvent.click(await screen.findByRole("button", { name: /enviar pedido/i }));

    await waitFor(() => expect(calls).toEqual(["user.updateMyProfile", "booking.submit"]));
  });

  it("shows the price the customer pays and no commission anywhere", async () => {
    // The commission comes out of the provider's payout. Showing the customer
    // a breakdown of money that never leaves their side invents a fee they
    // are not charged.
    //
    // "1500,00 MTn" and not the brief's "1.500,00 MZN": `pt-MZ` writes the
    // metical as "MTn", and it sets `minimumGroupingDigits: 2`, so a
    // four-digit amount carries no group separator at all. Both are what
    // `formatAmount` — the same formatter step 2's rail and the service
    // page's total use — actually produces, and a checkout total is the one
    // number on this platform that may not be approximated.
    renderConfirm({ bookingId: "bk-1", priceMinor: 150000, commissionMinor: 18000 });
    await screen.findByText("Studio X");
    // **Every amount on the page, listed**, now that the rail prints a
    // breakdown here rather than one bare figure: the service line and the
    // total, both the package's own. A "Taxa Ntizo" row would be a third and
    // would change the second, and neither an exact-match query nor
    // `/comiss/i` can see a bare figure in a breakdown — the rail's own suite
    // demonstrated a real commission line surviving both.
    const amounts = screen
      .getAllByText(/MTn/)
      .map((node) => (node.textContent ?? "").replace(/\s+/g, " ").trim());
    expect(amounts).toEqual(["1500,00 MTn", "1500,00 MTn"]);
    expect(screen.queryByText(/comiss/i)).not.toBeInTheDocument();
    // A regex, not the exact string. `queryByText("180,00")` matches a node
    // whose whole text is "180,00" and cannot see "180,00 MTn" — which is
    // what a commission line would actually render, because it would use the
    // page's own `formatAmount`. Demonstrated rather than reasoned: with the
    // exact-match version, injecting a real commission line into the rail
    // left all 17 tests in this file green. `/comiss/i` does not cover it
    // either, since a bare figure in a breakdown carries no label.
    expect(screen.queryByText(/180,00/)).not.toBeInTheDocument();
  });

  it("says nothing is charged now", async () => {
    // The mockup's own promise, and the one sentence on this page that would
    // be a lie under the old ordering.
    renderConfirm({ bookingId: "bk-1" });
    expect(await screen.findByText(/nada é cobrado agora/i)).toBeInTheDocument();
  });

  it("prints the provider's score and badge, which its own card never did", async () => {
    // **The rail's trust line, on the page the customer actually commits
    // on.** Both fields were already fetched for this page and neither was
    // printed, because step 3 carried a card of its own — provider name,
    // service name, price — while steps 1 and 2 shared the real rail. That is
    // follow-up #118, and it closes by this page rendering `CheckoutRail`
    // rather than a fourth copy of one.
    renderConfirm({ bookingId: "bk-1" });

    expect(await screen.findByText("Studio X")).toBeInTheDocument();
    // "4,2" in `pt-MZ` — the reader's own decimal separator, and a value no
    // default and no other fixture in the repo produces.
    expect(screen.getByText("4,2")).toBeInTheDocument();
    expect(screen.getByText("Verificado")).toBeInTheDocument();
    // The two promises the platform can actually keep. Still no cancellation
    // window: nothing in this product models one.
    expect(screen.getByText(/pagamento fica retido/i)).toBeInTheDocument();
    expect(screen.getByText(/documentos do prestador verificados/i)).toBeInTheDocument();
    expect(screen.queryByText(/cancelamento/i)).not.toBeInTheDocument();
  });

  it("says nothing about a score or a badge the booking does not carry", async () => {
    // Null is never 0: zero is a score a person could have given, and
    // printing it would tell the customer this is the worst provider on the
    // platform — on the last screen before they commit. Paired with the case
    // above so a hardcoded line fails one of the two.
    renderConfirm({
      bookingId: "bk-1",
      booking: bookingFixture({ providerRatingAverage: null, providerVerified: false }),
    });

    expect(await screen.findByText("Studio X")).toBeInTheDocument();
    expect(screen.queryByText("4,2")).not.toBeInTheDocument();
    expect(screen.queryByText("0,0")).not.toBeInTheDocument();
    expect(screen.queryByText("Verificado")).not.toBeInTheDocument();
  });

  it("says where the work happens, and claims no travel for a job at the provider's", async () => {
    // `locationType` reaches this page off the booking now. Without it the
    // rail printed the length alone and dropped "Deslocação — Incluída"
    // everywhere, which reads as a design decision rather than as a missing
    // field. A barber's shop is the case that has to stay silent: the
    // customer is the one travelling, and telling them their travel is
    // included would be a false statement about money.
    renderConfirm({ bookingId: "bk-1" });

    expect(await screen.findByText("No espaço dele · 90 min")).toBeInTheDocument();
    expect(screen.queryByText("Deslocação")).not.toBeInTheDocument();
    expect(screen.queryByText("Incluída")).not.toBeInTheDocument();
  });

  it("includes the travel only where the provider is the one travelling", async () => {
    // The other branch, and the pair is what stops either from passing
    // against a page that ignores the booking: the fixture's own value is
    // `at_provider`, so this line can only have come from the override.
    renderConfirm({
      bookingId: "bk-1",
      booking: bookingFixture({ locationType: "at_customer" }),
    });

    expect(await screen.findByText("Em sua casa · 90 min")).toBeInTheDocument();
    expect(screen.getByText("Deslocação")).toBeInTheDocument();
    expect(screen.getByText("Incluída")).toBeInTheDocument();
  });

  it("drops the location half alone when the booking cannot say where the work happens", async () => {
    // `null` is the read model's `leftJoin` answer rather than a state the
    // database can reach — but the rail is shared, and silence is the safe
    // direction for a claim about money wherever the caller cannot know.
    renderConfirm({
      bookingId: "bk-1",
      booking: bookingFixture({ locationType: null }),
    });

    // The length survives on its own; only the location half disappears.
    expect(await screen.findByText("90 min")).toBeInTheDocument();
    expect(screen.queryByText(/No espaço dele/)).not.toBeInTheDocument();
    expect(screen.queryByText("Deslocação")).not.toBeInTheDocument();
  });

  it("offers one way back to the time, on this booking's own package", async () => {
    // The rail's "Alterar", and the *only* control for it on this page: the
    // summary on the left is the record of what is being sent and carries
    // none, so a customer who notices the wrong hour has exactly one place to
    // press. Two of them, inches apart, is follow-up #117.
    const { router } = renderConfirm({ bookingId: "bk-1" });

    const buttons = await screen.findAllByRole("button", { name: /alterar/i });
    expect(buttons).toHaveLength(1);
    await userEvent.click(buttons[0]!);

    await waitFor(() => expect(router.state.location.pathname).toBe("/book/svc-1"));
    // The package too. Landing on the service with no option re-offers the
    // cheapest one, which is not necessarily what this customer chose.
    expect(router.state.location.search).toMatchObject({ optionId: "opt-2" });
  });

  it("reads the slot back in the service's zone, not the device's", async () => {
    // 22:30 UTC on the 4th is 00:30 on the 5th in Maputo. Printed in the
    // browser's zone this page would tell the customer a different day and a
    // different hour to the one the provider is expecting them for — the
    // same substitution that drew step 1 an empty grid under a live confirm
    // button, arriving one page later and with nothing on screen to reveal
    // it.
    renderConfirm({ bookingId: "bk-1" });

    // The summary's own long wording, which only it prints — the rail's
    // compact form says "sáb., 5/09".
    expect(await screen.findByText(/s[áa]bado, 5 de setembro/i)).toBeInTheDocument();
    // Twice: the summary on the left and the rail's QUANDO panel beside it
    // both print the clock, and they must agree — two clocks on one page make
    // whichever the customer checks against the other look wrong.
    expect(screen.getAllByText(/00:30/)).toHaveLength(2);
  });

  it("reads a second service's slot in that service's zone too", async () => {
    // The pair is what makes the case above device-independent. A machine's
    // own zone can coincide with at most one of `Africa/Maputo` and
    // `Pacific/Auckland`, so wherever this suite runs, at least one of these
    // two tests is asserting a time the browser would not have produced on
    // its own.
    renderConfirm({
      bookingId: "bk-1",
      booking: bookingFixture({ timezone: "Pacific/Auckland" }),
    });

    await waitFor(() => expect(screen.getAllByText(/10:30/)).toHaveLength(2));
  });

  it("sends the address and the note step 2 collected, and nothing about a seat", async () => {
    // The design's one-write-at-each-end rule, from the far end: the address
    // travelled here in the tab's own store and goes to the server for the
    // first time now. `line2` is joined onto `line` rather than dropped — a
    // flat number left behind is a provider standing outside the right door.
    renderConfirm({
      bookingId: "bk-1",
      addresses: [
        addressFixture("addr-1", "Casa", { isDefault: true }),
        addressFixture("addr-2", "Escritório", {
          line1: "Rua da Sé 42",
          line2: "3.º andar",
          directions: "Portão azul",
          latitude: "-25.9655",
          longitude: "32.5832",
        }),
      ],
      details: { addressId: "addr-2", description: "Portão azul", phoneNumber: "841234567" },
    });

    await userEvent.click(await screen.findByRole("button", { name: /enviar pedido/i }));

    await waitFor(() => expect(submitSpy).toHaveBeenCalledTimes(1));
    expect(submitSpy).toHaveBeenCalledWith({
      bookingId: "bk-1",
      address: {
        label: "Escritório",
        line: "Rua da Sé 42, 3.º andar",
        city: "Maputo",
        district: "Polana",
        directions: "Portão azul",
        lat: -25.9655,
        lng: 32.5832,
      },
      description: "Portão azul",
    });
    // **A capacity count is public; the index of the seat a booking took is
    // not.** Nothing on this page has one to leak — the query does not ask
    // for it and `bookingReadModel` does not carry it — and this asserts the
    // input as a whole rather than field by field, so a seat added to the
    // payload later fails here rather than shipping quietly.
    expect(submitSpy.mock.calls[0]?.[0]).not.toHaveProperty("seat");
  });

  it("stores the number in the form the charge reads back", async () => {
    // `toMpesaMsisdn` accepts `84…`, `258 84…` and `+258 84…` and answers
    // with `258XXXXXXXXX`; `profile.phone_number` holds E.164. Writing back
    // whatever the customer typed — spaces and all, and with no country —
    // would store a national number the charge has to guess a country for.
    renderConfirm({
      bookingId: "bk-1",
      details: { addressId: "addr-1", description: "", phoneNumber: "84 123 4567" },
    });
    await userEvent.click(await screen.findByRole("button", { name: /enviar pedido/i }));

    await waitFor(() => expect(fakes.updateMyProfile).toHaveBeenCalledTimes(1));
    expect(fakes.updateMyProfile).toHaveBeenCalledWith({ phoneNumber: "+258841234567" });
  });

  it("falls back to the profile's number when step 2 recorded none", async () => {
    // The store step 1 leaves behind carries an address and no phone, and a
    // customer who already has one on their profile never had to type it on
    // step 2 either. Sending them back for a number the platform is holding
    // would be work asked of them for nothing.
    renderConfirm({
      bookingId: "bk-1",
      details: { addressId: "addr-1", description: "", phoneNumber: null },
      user: userFixture({ phoneNumber: "+258845550101" }),
    });

    await userEvent.click(await screen.findByRole("button", { name: /enviar pedido/i }));

    await waitFor(() => expect(fakes.updateMyProfile).toHaveBeenCalledTimes(1));
    expect(fakes.updateMyProfile).toHaveBeenCalledWith({ phoneNumber: "+258845550101" });
  });

  it("prefers what the customer typed on step 2 over the number on file", async () => {
    // They changed it on the step before precisely because the one on file is
    // not the handset they want the prompt on.
    renderConfirm({
      bookingId: "bk-1",
      details: { addressId: "addr-1", description: "", phoneNumber: "845559999" },
      user: userFixture({ phoneNumber: "+258845550101" }),
    });

    await userEvent.click(await screen.findByRole("button", { name: /enviar pedido/i }));

    await waitFor(() => expect(fakes.updateMyProfile).toHaveBeenCalledTimes(1));
    expect(fakes.updateMyProfile).toHaveBeenCalledWith({ phoneNumber: "+258845559999" });
  });

  it("goes back for a number rather than sending without one", async () => {
    // `submit` refuses a customer with no number on file, so reaching the
    // server with nothing is a round trip whose only outcome is a refusal —
    // and, on a profile that already had one, a mutation that would clear it.
    // The address is treated the same way and for the same reason: the step
    // that asks is the only place either can be fixed.
    const { router } = renderConfirm({
      bookingId: "bk-1",
      details: { addressId: "addr-1", description: "", phoneNumber: null },
    });

    await waitFor(() => expect(router.state.location.pathname).toBe("/booking/bk-1/details"));
    expect(fakes.updateMyProfile).not.toHaveBeenCalled();
    expect(submitSpy).not.toHaveBeenCalled();
  });

  it("ends on this page, telling the customer what happens next", async () => {
    // **It must not navigate to `/bookings`.** That route is a placeholder
    // rendering "Ainda não há reservas.", and nothing in this app queries
    // `booking.mine` — so the last thing a customer saw after successfully
    // committing was the platform denying the booking exists, and the
    // obvious reaction is to book it again. This page is also the only one
    // holding `respondBy`.
    const { router } = renderConfirm({ bookingId: "bk-1" });
    await userEvent.click(await screen.findByRole("button", { name: /enviar pedido/i }));

    expect(await screen.findByText(/pedido enviado/i)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/booking/bk-1/confirm");
    // The form is gone with it: a live send button beside a sent request is
    // an invitation to send it twice.
    expect(screen.queryByRole("button", { name: /enviar pedido/i })).not.toBeInTheDocument();
  });

  it("names the deadline the provider is held to, in the service's zone", async () => {
    // `respondBy` comes back from the mutation — it is computed server-side
    // from the live `provider_response_minutes` setting and capped at the
    // slot's own start, so it is the one thing this page cannot work out for
    // itself. 12:45 UTC is 14:45 in Maputo; a deadline printed in the
    // browser's zone beside a slot printed in the provider's would put two
    // clocks on one page.
    submitSpy.mockResolvedValueOnce({
      bookingId: "bk-1",
      respondBy: "2026-09-04T12:45:00.000Z",
    });

    renderConfirm({ bookingId: "bk-1" });
    await userEvent.click(await screen.findByRole("button", { name: /enviar pedido/i }));

    expect(await screen.findByText(/14:45/)).toBeInTheDocument();
  });

  it("tells a customer whose provider never answered, rather than sending them back to step 1", async () => {
    // **`EXPIRED` means two different things**, and this page is the only one
    // that can meet the second: `BookingStatus.Expired` covers a DRAFT whose
    // checkout hold passed *and* an AWAITING_PROVIDER whose response window
    // did, and `SweepBookingCommand` writes it for both. With `accept` and
    // `decline` unmounted this phase, the second is the expected end state of
    // nearly every request sent.
    //
    // Treated as the first, the customer is silently redirected to step 1 and
    // told to pick a new time, never learning the provider did not answer —
    // and the behaviour flips on a sweep they cannot see, because the same
    // booking read "já foi enviado" a minute earlier.
    //
    // The discriminator is `addressLabel`, which is null on a DRAFT and only
    // on a DRAFT: `Booking.submit` refuses to leave DRAFT without one.
    const { router } = renderConfirm({
      bookingId: "bk-1",
      booking: bookingFixture({
        status: "EXPIRED",
        addressLabel: "Casa",
        addressLine: "Av. Julius Nyerere 1234",
        addressCity: "Maputo",
      }),
    });

    expect(await screen.findByText(/n[ãa]o respondeu a tempo/i)).toBeInTheDocument();
    // Stays put. The old behaviour was a redirect, and a redirect is what
    // made the loss invisible.
    expect(router.state.location.pathname).toBe("/booking/bk-1/confirm");
    // Offered, not imposed: picking another time is a choice they make.
    expect(screen.getByRole("link", { name: /escolher outra hora/i })).toBeInTheDocument();
  });

  it("still sends a lapsed *unsent* draft back to step 1", async () => {
    // The other half of `EXPIRED`, and the reason the discriminator has to be
    // the address rather than the status. This booking never reached step 2,
    // so there is nothing to report and the slot is genuinely gone.
    const { router } = renderConfirm({
      bookingId: "bk-1",
      booking: bookingFixture({ status: "EXPIRED", serviceOptionId: "opt-9" }),
    });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/book/svc-1");
      expect(router.state.location.search).toMatchObject({ expired: true, optionId: "opt-9" });
    });
  });

  it("never points a customer at a bookings page that denies the booking", async () => {
    // The claim this task removed from `rail-price-summary` and must not
    // reintroduce: the sent panel's body used to say "Pode acompanhá-lo nas
    // suas reservas", about a page that renders "Ainda não há reservas."
    renderConfirm({
      bookingId: "bk-1",
      booking: bookingFixture({ status: "COMPLETED", addressLabel: "Casa" }),
    });

    // A completed booking is paid for, and saying so is the one true thing
    // checkout can say about all four statuses past the charge. It used to
    // read "este pedido já foi enviado — o prestador responde-lhe assim que
    // puder", about work that has already been done.
    await screen.findByText(/j[áa] está paga/i);
    expect(screen.queryByText(/assim que puder/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/nas suas reservas/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /ver as minhas reservas/i }),
    ).not.toBeInTheDocument();
  });

  it("tells a customer whose provider accepted that the payment prompt is waiting", async () => {
    // **The status a wrong answer costs money on.** An operator hand-accepts
    // the request — the stated mode this phase — the charge sweep pushes an
    // M-Pesa prompt, and the payment window starts. The old catch-all told
    // this customer there was nothing left to do and the provider would
    // answer soon; believing it costs them the booking, and the provider is
    // then told the customer did not pay.
    renderConfirm({
      bookingId: "bk-1",
      booking: bookingFixture({ status: "PENDING_PAYMENT", addressLabel: "Casa" }),
    });

    expect(await screen.findByText(/falta pagar/i)).toBeInTheDocument();
    expect(screen.queryByText(/assim que puder/i)).not.toBeInTheDocument();
    // No send button and no countdown: the errand here is finished, and
    // `expiresAt` on this booking is the payment window rather than a
    // checkout hold.
    expect(screen.queryByRole("button", { name: /enviar pedido/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });

  it("says the provider declined rather than that they are still thinking", async () => {
    renderConfirm({
      bookingId: "bk-1",
      booking: bookingFixture({ status: "DECLINED", addressLabel: "Casa" }),
    });

    expect(await screen.findByText(/não aceitou o pedido/i)).toBeInTheDocument();
    expect(screen.getByText(/não foi cobrado nada/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /escolher outra hora/i })).toBeInTheDocument();
  });

  it("does not say the slot was released while the request is still landing", async () => {
    // **The last-seconds race, end to end.** The send is two sequential round
    // trips; the server accepts a submit a little past the deadline because
    // the checkout-hold sweep runs on a one-minute cadence. Without the guard
    // the countdown reaches zero mid-flight and navigates to step 1 saying
    // the slot was released — while the request lands. The customer books a
    // second slot, the one-draft rule does not clean up the first (it filters
    // `status = 'DRAFT'` and a sent request is not one), and the provider
    // gets two requests for one job.
    let land!: (result: { bookingId: string; respondBy: string }) => void;
    submitSpy.mockImplementationOnce(
      () => new Promise((resolve) => { land = resolve; }),
    );

    const { router } = renderConfirm({ bookingId: "bk-1" });
    await userEvent.click(await screen.findByRole("button", { name: /enviar pedido/i }));

    // The hold runs out with the mutation still in flight. `setSystemTime`
    // moves the clock the countdown reads; its own one-second interval is
    // real, so the disappearing timer is what says it has noticed.
    vi.setSystemTime(new Date(Date.parse(NOW) + 60 * 60 * 1000));
    await waitFor(() => expect(screen.queryByRole("timer")).not.toBeInTheDocument(), {
      timeout: 4000,
    });

    expect(router.state.location.pathname).toBe("/booking/bk-1/confirm");

    land({ bookingId: "bk-1", respondBy: "2026-09-04T14:00:00.000Z" });
    expect(await screen.findByText(/pedido enviado/i)).toBeInTheDocument();
    // And never the sentence that would have contradicted it.
    expect(screen.queryByText(/a hora foi libertada/i)).not.toBeInTheDocument();
  });

  it("offers one payment method rather than a chooser with disabled options", async () => {
    // M-Pesa only this phase; card and cash are out of scope with reasons of
    // their own. A radio group with one live option and two greyed ones
    // offers a decision nobody can make.
    renderConfirm({ bookingId: "bk-1" });

    expect(await screen.findByText("M-Pesa")).toBeInTheDocument();
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.queryByText(/cart[ãa]o/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/dinheiro/i)).not.toBeInTheDocument();
  });

  it("sends the customer back to step 1 when the draft has expired", async () => {
    // **`null` is not how a hold running out arrives.** The sweep marks the
    // draft `EXPIRED` and it goes on belonging to its customer, so
    // `booking.byId` returns a row; `CreateBookingCommand` marks a superseded
    // draft the same way. A page that only watched for `null` would render
    // the form, under a countdown already at zero, beside a send button whose
    // mutation can only be refused.
    const { router } = renderConfirm({
      bookingId: "bk-1",
      booking: bookingFixture({ status: "EXPIRED", serviceOptionId: "opt-9" }),
    });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/book/svc-1");
      expect(router.state.location.search).toMatchObject({ expired: true, optionId: "opt-9" });
    });
    expect(submitSpy).not.toHaveBeenCalled();
  });

  it("browses rather than guessing when the booking is not the customer's to read", async () => {
    // `null` is how the server answers for somebody else's booking and for an
    // id that never named one, undistinguished on purpose. It cannot mean
    // "back to step 1 with the service kept", because there is no service to
    // keep.
    const { router } = renderConfirm({ bookingId: "bk-1", booking: null });

    await waitFor(() => expect(router.state.location.pathname).toBe("/services"));
  });

  it("goes back for an address rather than sending without one", async () => {
    // The store is empty — a bookmarked confirm URL, or a tab that lost its
    // session storage — so there is nothing to send and no honest way to
    // guess. `booking.submit` refuses a booking with no address anyway; going
    // back to the step that asks is the difference between a refusal the
    // customer can act on and one they cannot.
    const { router } = renderConfirm({ bookingId: "bk-1", details: null });

    await waitFor(() => expect(router.state.location.pathname).toBe("/booking/bk-1/details"));
    expect(submitSpy).not.toHaveBeenCalled();
  });

  it("tells the same story on a refresh as it did on sending", async () => {
    // Reachable with the back button or a reload, and where a double-tap on
    // send lands. `expiresAt` on an `AWAITING_PROVIDER` booking *is* the
    // `respondBy` the mutation answered with, so the server can retell the
    // whole thing — which is what stops the page saying one thing in the
    // moment and something vaguer a minute later.
    //
    // 12:30 UTC is 14:30 in Maputo, and the fixture's `expiresAt` is the
    // response window here rather than a checkout hold: no countdown, because
    // a checkout timer on this booking would be counting somebody else's
    // deadline.
    renderConfirm({
      bookingId: "bk-1",
      booking: bookingFixture({ status: "AWAITING_PROVIDER", addressLabel: "Casa" }),
    });

    expect(await screen.findByText(/pedido enviado/i)).toBeInTheDocument();
    expect(screen.getByText(/14:30/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /enviar pedido/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });

  it("says why the send was refused, in the customer's own words", async () => {
    // The server's refusal is the rule — a UI convention can be skipped by
    // anything that calls the mutation directly — so the page has to be able
    // to say what came back. `CUSTOMER_PHONE_MISSING` is the one this form
    // exists to prevent, and reaching it means something else went wrong.
    // The shape the wire actually carries: the coarse kit code in `code` and
    // the domain one in `originalCode`, which is what `GraphqlError.code`
    // reads through to. A fake carrying only the coarse code would let the
    // page render the generic sentence and still pass.
    submitSpy.mockRejectedValueOnce(
      new GraphqlError(200, [
        {
          message: "Add a phone number to your profile before sending this request",
          extensions: { code: "UNPROCESSABLE", originalCode: "CUSTOMER_PHONE_MISSING" },
        },
      ]),
    );

    renderConfirm({ bookingId: "bk-1" });
    await userEvent.click(await screen.findByRole("button", { name: /enviar pedido/i }));

    expect(await screen.findByText(/volte aos detalhes e confirme o n[uú]mero/i)).toBeInTheDocument();

    // **The half-failure, and what makes "recoverable and not wrong" true.**
    // The profile write landed and the submit did not. The number has to
    // survive for the retry to be one press rather than a retype — and it
    // does from wherever the field lives, because it is read out of the tab's
    // store on mount rather than held in a form this failure could clear.
    // That matters here specifically: `updateMyProfile`'s own `onSuccess`
    // invalidates `user.me`, so a page seeding state off the profile would be
    // re-seeded mid-failure.
    expect(screen.getByText("841234567")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /enviar pedido/i }));

    await waitFor(() => expect(submitSpy).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/pedido enviado/i)).toBeInTheDocument();
    // The profile write ran again too — the second attempt is a whole send
    // rather than a submit stitched onto the first one's profile write.
    // (`booking.submit` appears once because the rejected attempt is a
    // `mockRejectedValueOnce`, which never reaches the fake that records it.)
    expect(calls).toEqual([
      "user.updateMyProfile",
      "user.updateMyProfile",
      "booking.submit",
    ]);
  });
});
