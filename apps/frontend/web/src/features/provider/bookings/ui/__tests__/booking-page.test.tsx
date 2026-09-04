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
import type { ProviderBookingDetailDTO } from "@ntizo/shared/read-models";
import { GraphqlError } from "@/shared/lib/graphql/session-graphql";
import i18n from "@/shared/lib/i18n";
import { BookingPage } from "../booking-page";

/**
 * The network is the seam, and it is the only one — the same bargain the
 * list's test makes.
 *
 * `sessionGraphql` rather than the repository or the hooks: the query key, the
 * `enabled` guard, the mutation inputs and the invalidation that follows a
 * successful answer are all this feature's own, and a mocked hook handed a
 * ready-made detail would assert none of them. `vi.mock` names a module rather
 * than importing one, so no `ui -> data` edge is created and the boundaries
 * policy is untouched.
 */
const fakes = vi.hoisted(() => ({ graphql: vi.fn() }));

// Only the request is replaced. `GraphqlError` stays the real class, because
// the page branches on the `.code` its *constructor* derives from
// `extensions.originalCode`; a mock that dropped it would leave this file
// hand-rolling an error shape the wire never sends, and the branch could rot
// without a test noticing.
vi.mock("@/shared/lib/graphql/session-graphql", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/lib/graphql/session-graphql")>()),
  sessionGraphql: fakes.graphql,
}));

vi.mock("@/features/provider/viewmodel/use-active-provider", () => ({
  useActiveProvider: () => ({
    providers: [],
    activeProvider: {
      id: "prov-1",
      slug: "estudio",
      name: "Estúdio Mavalane",
      type: "organization",
      status: "active",
      role: "owner",
    },
    setActive: () => {},
    loading: false,
    error: null,
    refresh: () => {},
  }),
}));

/**
 * A deadline 90 minutes and half a minute out — `timeLeftWording` floors the
 * gap to whole minutes, so the extra half minute is the margin that keeps the
 * countdown off the boundary for any run shorter than thirty seconds.
 */
function inNinetyMinutes(): string {
  return new Date(Date.now() + 90 * 60_000 + 30_000).toISOString();
}

/**
 * An instant relative to the run, because the page's closing rule is a
 * comparison against the clock: "has this appointment ended yet". A literal
 * date in a fixture answers that question differently depending on when the
 * suite is run, which is the one thing these tests must not depend on.
 */
function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 3_600_000).toISOString();
}

/**
 * The request as the provider first sees it: nothing revealed, the money
 * still to be decided, and a timeline whose last entry is the deadline it is
 * being decided against.
 */
function detailFixture(
  over: Partial<ProviderBookingDetailDTO> = {},
): ProviderBookingDetailDTO {
  return {
    id: "bk-1",
    status: "AWAITING_PROVIDER",
    createdAt: "2026-09-02T08:00:00.000Z",
    serviceId: "svc-1",
    serviceOptionId: "opt-1",
    serviceName: "Corte de cabelo",
    optionName: "Corte",
    durationMinutes: 60,
    locationType: "at_provider",
    providerMemberId: "mem-1",
    memberFirstName: "Célia",
    customerFirstName: "Ana",
    startsAt: "2026-09-05T09:00:00.000Z",
    endsAt: "2026-09-05T10:00:00.000Z",
    timezone: "Africa/Maputo",
    addressDistrict: null,
    addressCity: "Maputo",
    priceMinor: 80000,
    commissionBps: 1000,
    commissionMinor: 8000,
    currency: "MZN",
    respondBy: inNinetyMinutes(),
    addressLabel: null,
    addressLine: null,
    addressDirections: null,
    customerPhone: null,
    customerEmail: null,
    description: "Cabelo pelos ombros.",
    paymentRef: null,
    expiresAt: inNinetyMinutes(),
    timeline: [
      {
        at: "2026-09-02T08:00:00.000Z",
        reason: "submitted_by_customer",
        actor: "customer",
        pending: false,
      },
      { at: inNinetyMinutes(), reason: "respond_by", actor: "system", pending: true },
    ],
    ...over,
  };
}

/**
 * A paid booking whose appointment is over: the state the two closing
 * buttons exist for. The contact is filled in because the mapper reveals it
 * from `CONFIRMED` onwards, and the timeline carries the hops that got it
 * here.
 */
function confirmedFixture(over: Partial<ProviderBookingDetailDTO> = {}): ProviderBookingDetailDTO {
  return detailFixture({
    status: "CONFIRMED",
    respondBy: null,
    startsAt: hoursFromNow(-25),
    endsAt: hoursFromNow(-24),
    // `markPaid` hands `expires_at` on to the appointment's own end.
    expiresAt: hoursFromNow(-24),
    customerPhone: "+258840000001",
    customerEmail: "ana@example.com",
    addressLabel: "Casa",
    addressLine: "Av. X 1",
    paymentRef: "MP-77",
    timeline: [
      {
        at: "2026-09-02T08:00:00.000Z",
        reason: "submitted_by_customer",
        actor: "customer",
        pending: false,
      },
      {
        at: "2026-09-02T08:05:00.000Z",
        reason: "accepted_by_provider",
        actor: "provider",
        pending: false,
      },
    ],
    ...over,
  });
}

function renderBooking(at: string, detail: ProviderBookingDetailDTO = detailFixture()) {
  fakes.graphql.mockReset();
  // Dispatched on the operation, not on call order: the page reads once and
  // then writes, and after a write it reads again, so a mock that answered
  // positionally would hand the mutation's payload to the query.
  fakes.graphql.mockImplementation((query: string) => {
    if (query.includes("bookingAccept")) {
      return Promise.resolve({ bookingAccept: { bookingId: detail.id } });
    }
    if (query.includes("bookingDecline")) {
      return Promise.resolve({ bookingDecline: { bookingId: detail.id } });
    }
    if (query.includes("bookingMarkDone")) {
      return Promise.resolve({ bookingMarkDone: { bookingId: detail.id } });
    }
    if (query.includes("bookingStillOngoing")) {
      return Promise.resolve({ bookingStillOngoing: { bookingId: detail.id } });
    }
    return Promise.resolve({ bookingByIdForProvider: detail });
  });

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const rootRoute = createRootRoute();
  // Registered because the page's back link points at it; the list itself is
  // Task 10's and is stood in for.
  const listRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/provider/$slug/bookings",
    component: () => <p>lista</p>,
  });
  const detailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/provider/$slug/bookings/$bookingId",
    component: BookingPage,
  });

  const router = createRouter({
    routeTree: rootRoute.addChildren([listRoute, detailRoute]),
    history: createMemoryHistory({ initialEntries: [at] }),
  });

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return { router, queryClient };
}

/**
 * The locale is pinned, not inherited: every assertion here reads Portuguese
 * copy and the suite's default resolves to English (`test/setup.ts` says so).
 */
beforeEach(async () => {
  await i18n.changeLanguage("pt-MZ");
});

afterEach(async () => {
  await i18n.changeLanguage("en-US");
});

describe("BookingPage", () => {
  it("shows the decision header and hides the contact until paid", async () => {
    renderBooking("/provider/estudio/bookings/bk-1");

    expect(await screen.findByRole("heading", { name: "Ana" })).toBeInTheDocument();
    expect(screen.getByText("Ref. BK-1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aceitar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recusar" })).toBeInTheDocument();
    expect(screen.getByText(/contacto e morada exacta aparecem/i)).toBeInTheDocument();
    expect(screen.queryByText("+258")).not.toBeInTheDocument();
  });

  it("does the provider's arithmetic", async () => {
    renderBooking("/provider/estudio/bookings/bk-1");
    await screen.findByRole("heading", { name: "Ana" });

    expect(screen.getByText("Comissão (10%)")).toBeInTheDocument();
    // 80000 − 8000 minor units, as `formatMoney` prints them in pt-MZ.
    expect(screen.getByText("720,00 MTn")).toBeInTheDocument();
  });

  it("accept is one press and says what happens next", async () => {
    renderBooking("/provider/estudio/bookings/bk-1");

    await userEvent.click(await screen.findByRole("button", { name: "Aceitar" }));

    expect(
      await screen.findByText(/enviámos o pedido de pagamento/i),
    ).toBeInTheDocument();
    expect(fakes.graphql).toHaveBeenCalledWith(
      expect.stringContaining("bookingAccept"),
      { input: { bookingId: "bk-1" } },
    );
  });

  it("decline asks for a reason and sends the token", async () => {
    renderBooking("/provider/estudio/bookings/bk-1");

    await userEvent.click(await screen.findByRole("button", { name: "Recusar" }));
    await userEvent.click(
      await screen.findByRole("radio", { name: /fora da minha zona/i }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Recusar pedido" }));

    await waitFor(() =>
      expect(fakes.graphql).toHaveBeenCalledWith(
        expect.stringContaining("bookingDecline"),
        { input: { bookingId: "bk-1", reason: "outside_area" } },
      ),
    );
  });

  it("a refused decline closes its dialog and says the request was already answered", async () => {
    renderBooking("/provider/estudio/bookings/bk-1");
    await screen.findByRole("heading", { name: "Ana" });

    // The race this page is written around: the customer cancelled, or the
    // deadline passed, while the dialog sat open. The error is built the way
    // `sessionGraphql` builds it — the domain code arrives in
    // `extensions.originalCode` and the constructor is what turns it into the
    // `.code` the page reads.
    fakes.graphql.mockImplementation((query: string) => {
      if (query.includes("bookingDecline")) {
        return Promise.reject(
          new GraphqlError(200, [
            {
              message: "Booking is not awaiting a provider decision.",
              extensions: { code: "CONFLICT", originalCode: "BOOKING_INVALID_TRANSITION" },
            },
          ]),
        );
      }
      return Promise.resolve({ bookingByIdForProvider: detailFixture() });
    });

    await userEvent.click(screen.getByRole("button", { name: "Recusar" }));
    await userEvent.click(screen.getByRole("button", { name: "Recusar pedido" }));

    expect(await screen.findByText("Este pedido já foi respondido.")).toBeInTheDocument();
    // The dialog is gone rather than left sitting over the notice explaining
    // why it failed — with its confirm button still pressable, which would
    // send the same refused mutation again.
    expect(
      screen.queryByRole("button", { name: "Recusar pedido" }),
    ).not.toBeInTheDocument();
  });

  it("draws the timeline with the pending deadline last", async () => {
    renderBooking("/provider/estudio/bookings/bk-1");
    await screen.findByRole("heading", { name: "Ana" });

    const items = screen.getAllByRole("listitem", {
      name: /pedido enviado|responder até|reserva iniciada/i,
    });

    expect(items.at(-1)).toHaveTextContent(/responder até/i);
  });

  it("reveals the contact once confirmed, and drops the actions", async () => {
    renderBooking(
      "/provider/estudio/bookings/bk-1",
      detailFixture({
        status: "CONFIRMED",
        respondBy: null,
        customerPhone: "+258840000001",
        customerEmail: "ana@example.com",
        addressLabel: "Casa",
        addressLine: "Av. X 1",
        timeline: [
          {
            at: "2026-09-02T08:00:00.000Z",
            reason: "submitted_by_customer",
            actor: "customer",
            pending: false,
          },
          {
            at: "2026-09-02T08:05:00.000Z",
            reason: "accepted_by_provider",
            actor: "provider",
            pending: false,
          },
        ],
      }),
    );

    expect(await screen.findByText("+258840000001")).toBeInTheDocument();
    expect(screen.getByText("Av. X 1", { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aceitar" })).not.toBeInTheDocument();
  });

  it("offers to close a confirmed booking whose appointment has passed", async () => {
    renderBooking("/provider/estudio/bookings/bk-1", confirmedFixture());

    expect(
      await screen.findByRole("button", { name: "Marcar como concluído" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ainda a decorrer" })).toBeInTheDocument();
    // What the press does, before it is pressed: the three days start the
    // moment it lands and nothing here can call them back.
    expect(
      screen.getByText("O cliente fica com três dias para avaliar ou reclamar."),
    ).toBeInTheDocument();
  });

  it("offers nothing while the appointment is still ahead", async () => {
    renderBooking(
      "/provider/estudio/bookings/bk-2",
      confirmedFixture({ id: "bk-2", startsAt: hoursFromNow(24), endsAt: hoursFromNow(25) }),
    );

    await screen.findByRole("heading", { name: "Ana" });

    expect(
      screen.queryByRole("button", { name: "Marcar como concluído" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Ainda a decorrer" }),
    ).not.toBeInTheDocument();
    // Not merely absent: the page says why, so a provider looking for the
    // button is told it is coming rather than left thinking it is missing.
    expect(screen.getByText("Só depois de o serviço ter terminado.")).toBeInTheDocument();
  });

  it("says what happens next when the provider closes it", async () => {
    renderBooking("/provider/estudio/bookings/bk-1", confirmedFixture());

    await userEvent.click(
      await screen.findByRole("button", { name: "Marcar como concluído" }),
    );

    expect(await screen.findByText(/o cliente tem três dias/i)).toBeInTheDocument();
    expect(fakes.graphql).toHaveBeenCalledWith(
      expect.stringContaining("BookingMarkDone"),
      { input: { bookingId: "bk-1" } },
    );
  });

  it("pushes the clock when the work is still going", async () => {
    renderBooking("/provider/estudio/bookings/bk-1", confirmedFixture());

    await userEvent.click(await screen.findByRole("button", { name: "Ainda a decorrer" }));

    expect(await screen.findByText(/voltamos a perguntar/i)).toBeInTheDocument();
    expect(fakes.graphql).toHaveBeenCalledWith(
      expect.stringContaining("BookingStillOngoing"),
      { input: { bookingId: "bk-1" } },
    );
  });

  it("says nothing about another week when the platform closed it first", async () => {
    renderBooking("/provider/estudio/bookings/bk-1", confirmedFixture());
    await screen.findByRole("button", { name: "Ainda a decorrer" });

    // The race the compare-and-swap is silent about: the sweep's own
    // seven-day arm marked this booking done a moment before the press. The
    // mutation still answers `{ bookingId }` — the wire cannot say "nothing
    // moved" — and only the read that follows shows who won.
    fakes.graphql.mockImplementation((query: string) => {
      if (query.includes("bookingStillOngoing")) {
        return Promise.resolve({ bookingStillOngoing: { bookingId: "bk-1" } });
      }
      return Promise.resolve({
        bookingByIdForProvider: confirmedFixture({
          status: "MARKED_DONE",
          expiresAt: hoursFromNow(48),
        }),
      });
    });

    await userEvent.click(screen.getByRole("button", { name: "Ainda a decorrer" }));

    expect(await screen.findByText(/o cliente tem três dias/i)).toBeInTheDocument();
    expect(screen.queryByText(/voltamos a perguntar/i)).not.toBeInTheDocument();
  });

  it("says the closing failed in the closing's own words", async () => {
    renderBooking("/provider/estudio/bookings/bk-1", confirmedFixture());
    await screen.findByRole("button", { name: "Marcar como concluído" });

    fakes.graphql.mockImplementation((query: string) => {
      if (query.includes("bookingMarkDone")) {
        return Promise.reject(
          new GraphqlError(500, [{ message: "boom", extensions: { code: "INTERNAL" } }]),
        );
      }
      return Promise.resolve({ bookingByIdForProvider: confirmedFixture() });
    });

    await userEvent.click(screen.getByRole("button", { name: "Marcar como concluído" }));

    expect(
      await screen.findByText("Não foi possível fechar a reserva agora. Tente de novo."),
    ).toBeInTheDocument();
  });

  it("shows the window on a booking that is waiting for the customer", async () => {
    renderBooking(
      "/provider/estudio/bookings/bk-3",
      confirmedFixture({ id: "bk-3", status: "MARKED_DONE", expiresAt: hoursFromNow(48) }),
    );

    expect(await screen.findByText(/o cliente responde até/i)).toBeInTheDocument();
    // Closed once, and not offered again: the window is the customer's now.
    expect(
      screen.queryByRole("button", { name: "Marcar como concluído" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Marcada como concluída")).toBeInTheDocument();
  });

  it("says so when the platform has already asked for this one to be closed", async () => {
    renderBooking(
      "/provider/estudio/bookings/bk-1",
      confirmedFixture({
        timeline: [
          {
            at: "2026-09-02T08:00:00.000Z",
            reason: "submitted_by_customer",
            actor: "customer",
            pending: false,
          },
          { at: hoursFromNow(-2), reason: "close_reminder", actor: "system", pending: false },
        ],
      }),
    );

    expect(await screen.findByText("Pedimos-lhe que feche esta reserva.")).toBeInTheDocument();
  });
});
