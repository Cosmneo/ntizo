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
import { GraphqlError } from "@/shared/lib/graphql/session-graphql";
import { saveDraftDetails } from "@/features/checkout/domain/draft-store";

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

function userFixture(over: Record<string, unknown> = {}): unknown {
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
   * What step 2 left in the tab's store. `undefined` means "seed the usual
   * thing"; `null` means the store is genuinely empty, which is how a
   * customer who typed this URL straight in arrives.
   */
  details = { addressId: "addr-1", description: "Portão azul" } as
    | { addressId: string | null; description: string }
    | null,
  priceMinor,
  commissionMinor,
}: {
  bookingId: string;
  /** `null` is what the server answers with for an id that is not this customer's. */
  booking?: unknown;
  addresses?: AddressDTO[];
  user?: unknown;
  details?: { addressId: string | null; description: string } | null;
  priceMinor?: number;
  commissionMinor?: number;
}) {
  fakes.booking =
    booking && (priceMinor !== undefined || commissionMinor !== undefined)
      ? {
          ...(booking as object),
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
  it("validates the phone with the same rule the charge uses", async () => {
    // 82 is a real Mozambican prefix and not Vodacom's. A laxer browser rule
    // would accept it here and the charge would fail on it later, after the
    // provider had already blocked their calendar.
    renderConfirm({ bookingId: "bk-1" });
    await userEvent.type(await screen.findByLabelText(/telem[oó]vel/i), "821234567");
    await userEvent.click(screen.getByRole("button", { name: /enviar pedido/i }));

    expect(await screen.findByText(/n[uú]mero.*Vodacom/i)).toBeInTheDocument();
    expect(submitSpy).not.toHaveBeenCalled();
  });

  it("saves the phone before submitting, in that order", async () => {
    // Two mutations, not one: setting a phone number is the User context's
    // job. If the second fails the phone is still saved, which is recoverable
    // and not wrong.
    renderConfirm({ bookingId: "bk-1" });
    await userEvent.type(await screen.findByLabelText(/telem[oó]vel/i), "841234567");
    await userEvent.click(screen.getByRole("button", { name: /enviar pedido/i }));

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
    expect(await screen.findByText("1500,00 MTn")).toBeInTheDocument();
    expect(screen.queryByText(/comiss/i)).not.toBeInTheDocument();
    expect(screen.queryByText("180,00")).not.toBeInTheDocument();
  });

  it("says nothing is charged now", async () => {
    // The mockup's own promise, and the one sentence on this page that would
    // be a lie under the old ordering.
    renderConfirm({ bookingId: "bk-1" });
    expect(await screen.findByText(/nada é cobrado agora/i)).toBeInTheDocument();
  });

  it("reads the slot back in the service's zone, not the device's", async () => {
    // 22:30 UTC on the 4th is 00:30 on the 5th in Maputo. Printed in the
    // browser's zone this page would tell the customer a different day and a
    // different hour to the one the provider is expecting them for — the
    // same substitution that drew step 1 an empty grid under a live confirm
    // button, arriving one page later and with nothing on screen to reveal
    // it.
    renderConfirm({ bookingId: "bk-1" });

    expect(await screen.findByText(/s[áa]bado, 5 de setembro/i)).toBeInTheDocument();
    expect(screen.getByText(/00:30/)).toBeInTheDocument();
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

    expect(await screen.findByText(/10:30/)).toBeInTheDocument();
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
      details: { addressId: "addr-2", description: "Portão azul" },
    });

    await userEvent.type(await screen.findByLabelText(/telem[oó]vel/i), "841234567");
    await userEvent.click(screen.getByRole("button", { name: /enviar pedido/i }));

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
    // whatever the customer typed would store a national number the charge
    // has to guess a country for.
    renderConfirm({ bookingId: "bk-1" });
    await userEvent.type(await screen.findByLabelText(/telem[oó]vel/i), "84 123 4567");
    await userEvent.click(screen.getByRole("button", { name: /enviar pedido/i }));

    await waitFor(() => expect(fakes.updateMyProfile).toHaveBeenCalledTimes(1));
    expect(fakes.updateMyProfile).toHaveBeenCalledWith({ phoneNumber: "+258841234567" });
  });

  it("opens on the number already on the profile", async () => {
    // The commonest case is a customer who has one: retyping a number the
    // platform already holds is work asked of them for nothing.
    renderConfirm({
      bookingId: "bk-1",
      user: userFixture({ phoneNumber: "+258845550101" }),
    });

    expect(await screen.findByLabelText(/telem[oó]vel/i)).toHaveValue("+258845550101");
  });

  it("refuses an empty field rather than calling anything", async () => {
    // `submit` refuses a customer with no number on file, so a blank field
    // reaching the server is a round trip whose only outcome is a refusal —
    // and, on a profile that already had one, a mutation that would clear it.
    renderConfirm({ bookingId: "bk-1" });

    await userEvent.click(await screen.findByRole("button", { name: /enviar pedido/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(fakes.updateMyProfile).not.toHaveBeenCalled();
    expect(submitSpy).not.toHaveBeenCalled();
  });

  it("moves on to the bookings list once the request has gone", async () => {
    const { router } = renderConfirm({ bookingId: "bk-1" });
    await userEvent.type(await screen.findByLabelText(/telem[oó]vel/i), "841234567");
    await userEvent.click(screen.getByRole("button", { name: /enviar pedido/i }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/bookings"));
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

  it("shows the request rather than the form once it has been sent", async () => {
    // Reachable with the back button, and where a double-tap on send lands.
    // `expiresAt` on a submitted booking is the provider's response window,
    // so a checkout countdown here would be counting somebody else's
    // deadline, and a send button would call a mutation that has already run.
    renderConfirm({
      bookingId: "bk-1",
      booking: bookingFixture({ status: "AWAITING_PROVIDER" }),
    });

    expect(await screen.findByText(/já foi enviado/i)).toBeInTheDocument();
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
    await userEvent.type(await screen.findByLabelText(/telem[oó]vel/i), "841234567");
    await userEvent.click(screen.getByRole("button", { name: /enviar pedido/i }));

    expect(await screen.findByText(/confirme o n[uú]mero acima/i)).toBeInTheDocument();
  });
});
