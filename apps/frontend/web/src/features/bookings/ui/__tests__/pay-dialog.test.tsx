import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BookingDTO, CustomerBookingDetailDTO } from "@ntizo/shared/read-models";
import i18n from "@/shared/lib/i18n";
import { PayDialog } from "../pay-dialog";

/**
 * The network is the seam, and it is the only one — the same boundary
 * `cancel-dialog.test.tsx` draws, extended here to three operations instead
 * of one: `bookingPay`, `bookingById` (the poll `usePayBookingPoll` drives)
 * and `userUpdateMe` (the existing profile mutation the phone form reuses).
 * All three cross the wire through the one `sessionGraphql` call, so one
 * mock dispatches on the operation name in the query string rather than
 * three separate module mocks — there is only one seam to fake.
 */
const fakes = vi.hoisted(() => ({ graphql: vi.fn() }));

vi.mock("@/shared/lib/graphql/session-graphql", () => ({
  sessionGraphql: fakes.graphql,
}));

const PAST = "2020-01-01T00:00:00.000Z";

/**
 * The booking screen 6 is drawn against: a plumbing job worth 1 800 MZN,
 * `PENDING_PAYMENT`, no deadline stamped (`expiresAt: null`) so the default
 * fixture never trips the window-closed path by accident — only the test
 * that means to (`expiresAt: PAST`) does.
 */
function pendingPayment(over: Partial<BookingDTO> = {}): BookingDTO {
  return {
    id: "b1",
    status: "PENDING_PAYMENT",
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

function confirmedBooking(over: Partial<BookingDTO> = {}): BookingDTO {
  return pendingPayment({
    status: "CONFIRMED",
    paidAt: "2026-09-03T09:00:00.000Z",
    ...over,
  });
}

function toDetail(booking: BookingDTO): CustomerBookingDetailDTO {
  return { ...booking, timeline: [] };
}

/** What `sessionGraphql` throws for a refused mutation — `GraphqlError`'s own shape, minus the parts this dialog never reads. */
function refusal(code: string): Error & { code: string } {
  return Object.assign(new Error("refused"), { code });
}

let payImpl: () => Promise<unknown>;
let detailImpl: (() => Promise<{ bookingById: CustomerBookingDetailDTO | null }>) | null;
let updateImpl: () => Promise<unknown>;

/**
 * The locale is pinned, not inherited — the same bargain
 * `cancel-dialog.test.tsx` makes: every assertion here reads Portuguese
 * copy and the suite's default resolves to English (`test/setup.ts`).
 */
beforeEach(async () => {
  await i18n.changeLanguage("pt-MZ");
  fakes.graphql.mockReset();

  // Defaults every test gets unless it overrides one: paying succeeds,
  // saving the profile succeeds, and `detailImpl` is left null so
  // `renderDialog` can default it to echo back the exact booking the test
  // renders with — a poll that answered with some *other* fixture's
  // `expiresAt` would silently overrule the very prop a test like "the
  // window closed" is asserting against. Tests that need a refusal, or a
  // poll that diverges from what the dialog opened with (the "confirmed"
  // test), set the relevant `*Impl` before rendering.
  payImpl = () => Promise.resolve({ bookingPay: { bookingId: "b1" } });
  detailImpl = null;
  updateImpl = () => Promise.resolve({ userUpdateMe: { ok: true } });

  fakes.graphql.mockImplementation((query: string) => {
    if (query.includes("BookingPay")) return payImpl();
    if (query.includes("BookingById")) {
      if (!detailImpl) throw new Error("pay-dialog.test.tsx: detailImpl not set — call renderDialog first");
      return detailImpl();
    }
    if (query.includes("UserUpdateMe")) return updateImpl();
    throw new Error(`pay-dialog.test.tsx: unexpected query — ${query.slice(0, 40)}`);
  });
});

afterEach(async () => {
  await i18n.changeLanguage("en-US");
});

function renderDialog(
  booking: BookingDTO,
  phone: string | null,
  onClose = vi.fn(),
) {
  // Only if the test hasn't already set its own — see the comment on the
  // `detailImpl = null` default above.
  if (!detailImpl) {
    detailImpl = () => Promise.resolve({ bookingById: toDetail(booking) });
  }
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <PayDialog booking={booking} phone={phone} onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onClose, qc };
}

describe("PayDialog", () => {
  it("tells the customer to confirm on their handset, with the masked number", async () => {
    renderDialog(pendingPayment(), "+258849994567");

    await waitFor(() =>
      expect(screen.getByText(/Confirme no seu telemóvel/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/\+258 84 ••• 45 67/)).toBeInTheDocument();
  });

  // The failure the whole flow was built around: a customer with nothing on
  // file gets asked, right here, instead of three silent charge attempts.
  it("asks for the number when the mutation says there is none", async () => {
    payImpl = () => Promise.reject(refusal("BOOKING_NO_CUSTOMER_PHONE"));
    renderDialog(pendingPayment(), null);

    expect(await screen.findByLabelText("Número de telemóvel")).toBeInTheDocument();
  });

  it("saves the number and pays, in that order", async () => {
    let payCalls = 0;
    payImpl = () => {
      payCalls += 1;
      return payCalls === 1
        ? Promise.reject(refusal("BOOKING_NO_CUSTOMER_PHONE"))
        : Promise.resolve({ bookingPay: { bookingId: "b1" } });
    };
    const updateSpy = vi.fn(updateImpl);
    updateImpl = updateSpy;

    renderDialog(pendingPayment(), null);

    await userEvent.type(
      await screen.findByLabelText("Número de telemóvel"),
      "849994567",
    );
    await userEvent.click(screen.getByRole("button", { name: "Guardar e pagar" }));

    await waitFor(() => expect(updateSpy).toHaveBeenCalled());
    expect(payCalls).toBe(2);
  });

  it("stops polling and closes once the booking is confirmed", async () => {
    let detailCalls = 0;
    detailImpl = () => {
      detailCalls += 1;
      const booking = detailCalls === 1 ? pendingPayment() : confirmedBooking();
      return Promise.resolve({ bookingById: toDetail(booking) });
    };
    const { onClose } = renderDialog(pendingPayment(), "+258849994567");

    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: 10_000 });
  }, 10_000);

  it("says the window closed rather than spinning for ever", async () => {
    renderDialog(pendingPayment({ expiresAt: PAST }), "+258849994567");

    expect(await screen.findByText(/O prazo para pagar terminou/)).toBeInTheDocument();
    // No wasted request: the deadline was already behind us when the
    // dialog opened, so it never asks the server to find that out.
    expect(fakes.graphql.mock.calls.some(([q]) => q.includes("BookingPay"))).toBe(
      false,
    );
  });

  it("says the attempts are spent, with its own sentence", async () => {
    payImpl = () => Promise.reject(refusal("BOOKING_CHARGE_ATTEMPTS_SPENT"));
    renderDialog(pendingPayment(), "+258849994567");

    expect(
      await screen.findByText(/Já tentámos cobrar esta reserva três vezes/),
    ).toBeInTheDocument();
  });

  // `BOOKING_INVALID_TRANSITION` means the booking left `PENDING_PAYMENT`
  // between this dialog opening and the mutation landing — the same fact
  // `CancelDialog`'s `cancelDialogMoved` names, and the same reasoning: no
  // retry would land differently, so this must not fall into the generic
  // "try again" sentence the way it did before the review caught it.
  it("says the booking has already moved on for a BOOKING_INVALID_TRANSITION refusal, not the generic retry sentence", async () => {
    payImpl = () => Promise.reject(refusal("BOOKING_INVALID_TRANSITION"));
    renderDialog(pendingPayment(), "+258849994567");

    expect(
      await screen.findByText("Esta reserva já avançou e já não pode ser paga."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Tente novamente/)).not.toBeInTheDocument();
  });

  // Nothing here should ever fire against a real caller's own booking, but a
  // refusal that does arrive must not promise a retry it cannot honour
  // either — the same rule `BOOKING_INVALID_TRANSITION` gets, on a code with
  // even less of a claimable cause to name.
  it("does not promise a retry for a NOT_BOOKING_CUSTOMER refusal", async () => {
    payImpl = () => Promise.reject(refusal("NOT_BOOKING_CUSTOMER"));
    renderDialog(pendingPayment(), "+258849994567");

    expect(
      await screen.findByText("Não foi possível concluir este pagamento."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Tente novamente/)).not.toBeInTheDocument();
  });

  // The bug the review caught: a booking cancelled from elsewhere while this
  // dialog sat open — not `PENDING_PAYMENT`, not `CONFIRMED` — used to be
  // read as the payment window having run out, which was never true. The
  // poll landing on `CANCELLED` must say exactly that, not guess a clock ran
  // out.
  it(
    "says the booking was cancelled, not that the window closed, when the poll reads CANCELLED",
    async () => {
      let detailCalls = 0;
      detailImpl = () => {
        detailCalls += 1;
        const booking =
          detailCalls === 1 ? pendingPayment() : pendingPayment({ status: "CANCELLED" });
        return Promise.resolve({ bookingById: toDetail(booking) });
      };
      renderDialog(pendingPayment(), "+258849994567");

      expect(
        await screen.findByText("Esta reserva foi cancelada. Já não há nada a pagar.", undefined, {
          timeout: 10_000,
        }),
      ).toBeInTheDocument();
      expect(screen.queryByText(/O prazo para pagar terminou/)).not.toBeInTheDocument();
    },
    10_000,
  );

  // A codeless failure — a dropped connection, not one of the five refusals
  // this command can throw — is the one ending where "try again in a
  // moment" is actually an honest thing to say.
  it("falls back to the generic retry sentence only for a refusal it cannot name", async () => {
    payImpl = () => Promise.reject(new Error("network drop"));
    renderDialog(pendingPayment(), "+258849994567");

    expect(
      await screen.findByText("Não foi possível pedir o pagamento agora. Tente novamente dentro de momentos."),
    ).toBeInTheDocument();
  });

  /**
   * I4. This dialog sits open for minutes waiting on a handset, which is
   * exactly how long a session takes to lapse — so `UNAUTHENTICATED` is
   * reachable, and it used to fall through to "try again in a moment": a
   * retry that can never succeed until the customer signs in, which nothing
   * told them to do.
   */
  it("tells a signed-out customer to sign in again, not to retry", async () => {
    payImpl = () => Promise.reject(refusal("UNAUTHENTICATED"));
    renderDialog(pendingPayment(), "+258849994567");

    expect(
      await screen.findByText(
        "A sua sessão terminou. Inicie sessão outra vez para pagar esta reserva.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Tente novamente/)).not.toBeInTheDocument();
  });

  it("says the booking is gone for BOOKING_NOT_FOUND, and promises no retry", async () => {
    payImpl = () => Promise.reject(refusal("BOOKING_NOT_FOUND"));
    renderDialog(pendingPayment(), "+258849994567");

    expect(await screen.findByText("Já não encontramos esta reserva.")).toBeInTheDocument();
    expect(screen.queryByText(/Tente novamente/)).not.toBeInTheDocument();
  });

  /**
   * I5's other half. A stage whose payment processor is misconfigured used to
   * tell every customer a prompt was on its way to their handset; the command
   * now refuses instead, and this is the one refusal where "try again in a
   * moment" is honest — the fix is somebody else's and the booking is fine.
   */
  it("offers the generic retry when the processor is not configured", async () => {
    payImpl = () => Promise.reject(refusal("BOOKING_CHARGE_UNAVAILABLE"));
    renderDialog(pendingPayment(), "+258849994567");

    expect(
      await screen.findByText(
        "Não foi possível pedir o pagamento agora. Tente novamente dentro de momentos.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Enviámos um pedido M-Pesa/)).not.toBeInTheDocument();
  });

  /**
   * C3's customer-facing half. A press inside the charge cooldown pushes
   * nothing over a prompt that may still be live; the command says so with
   * `promptAlreadySent`, and this dialog must not repeat "this page updates
   * itself" as though a fresh prompt had gone out.
   */
  it("says the prompt was already on its way when a second press pushed nothing", async () => {
    payImpl = () =>
      Promise.resolve({ bookingPay: { bookingId: "b1", promptAlreadySent: true } });
    renderDialog(pendingPayment(), "+258849994567");

    expect(
      await screen.findByText(
        "Já lhe enviámos um pedido há instantes. Confirme-o no telemóvel — não enviámos um segundo.",
      ),
    ).toBeInTheDocument();
    // Still the waiting state — this is not a failure, and the customer is
    // still being asked to confirm on their handset.
    expect(screen.getByText(/Confirme no seu telemóvel/)).toBeInTheDocument();
    expect(screen.queryByText(/actualiza-se sozinha/)).not.toBeInTheDocument();
  });

  it("closes right away when Fechar is pressed, without waiting for the poll", async () => {
    const { onClose } = renderDialog(pendingPayment(), "+258849994567");

    await waitFor(() =>
      expect(screen.getByText(/Confirme no seu telemóvel/)).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole("button", { name: "Fechar" }));

    expect(onClose).toHaveBeenCalled();
  });
});
