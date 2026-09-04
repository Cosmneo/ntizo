import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BookingDTO } from "@ntizo/shared/read-models";
import i18n from "@/shared/lib/i18n";
import { CancelDialog } from "../cancel-dialog";

/**
 * The network is the seam, and it is the only one — the same boundary
 * `bookings-page.test.tsx` and `booking-page.test.tsx` draw for the same
 * reason: everything between this dialog and the wire (the mutation's name,
 * its `bookingId` input) is this feature's own.
 */
const fakes = vi.hoisted(() => ({ graphql: vi.fn() }));

vi.mock("@/shared/lib/graphql/session-graphql", () => ({
  sessionGraphql: fakes.graphql,
}));

/**
 * The exact booking mockup screen 7 draws: Canalização · Amélia Sitoe,
 * Monday-the-8th at 14:30, still `PENDING_PAYMENT` — so the dialog's copy
 * ("fica livre", "é avisado", "ainda não pagou") can be checked against the
 * mockup's own sentence rather than an arbitrary fixture.
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

function renderDialog(qc: QueryClient, onClose = vi.fn()) {
  render(
    <QueryClientProvider client={qc}>
      <CancelDialog booking={pendingPayment()} onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onClose };
}

/** What `sessionGraphql` throws for a refused mutation — `GraphqlError`'s own shape, minus the parts this dialog never reads. */
function refusal(code: string): Error & { code: string } {
  return Object.assign(new Error("refused"), { code });
}

/**
 * The locale is pinned, not inherited: every assertion here reads Portuguese
 * copy and the suite's default resolves to English (`test/setup.ts`) — the
 * same bargain the list's and the detail's own suites make.
 */
beforeEach(async () => {
  await i18n.changeLanguage("pt-MZ");
  fakes.graphql.mockReset();
});

afterEach(async () => {
  await i18n.changeLanguage("en-US");
});

describe("CancelDialog", () => {
  it("says what will happen, rather than asking for certainty", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderDialog(qc);

    expect(screen.getByText(/fica livre/)).toBeInTheDocument();
    expect(screen.getByText(/é avisada|é avisado/)).toBeInTheDocument();
    expect(screen.getByText(/ainda não pagou/)).toBeInTheDocument();
  });

  it("cancels and closes", async () => {
    fakes.graphql.mockResolvedValue({ bookingCancel: { bookingId: "b1" } });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { onClose } = renderDialog(qc);

    await userEvent.click(screen.getByRole("button", { name: "Cancelar reserva" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(fakes.graphql).toHaveBeenCalledWith(
      expect.stringContaining("bookingCancel"),
      { input: { bookingId: "b1" } },
    );
  });

  // The list and the detail both move on: the row changes tab and the chips
  // change with it — both read off the one `["bookings"]` prefix.
  it("drops every cached read of the customer's bookings", async () => {
    fakes.graphql.mockResolvedValue({ bookingCancel: { bookingId: "b1" } });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    renderDialog(qc);

    await userEvent.click(screen.getByRole("button", { name: "Cancelar reserva" }));

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["bookings"] }),
    );
  });

  it("keeps the booking and closes without calling the mutation", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { onClose } = renderDialog(qc);

    await userEvent.click(screen.getByRole("button", { name: "Manter" }));

    expect(onClose).toHaveBeenCalled();
    expect(fakes.graphql).not.toHaveBeenCalled();
  });

  // `BOOKING_INVALID_TRANSITION`: the provider answered or the payment
  // landed while this dialog sat open. A retry would refuse identically
  // forever, so the message says the booking moved on rather than inviting
  // one — and the cache still drops, so the row behind this dialog stops
  // offering Cancelar the moment it closes.
  //
  // The code faked here must be the one the domain actually throws
  // (`BookingTransitionError`'s `code`, in
  // `packages/backend/.../booking/domain/exceptions.ts`) — not a string
  // that merely looks plausible. The dialog used to match on
  // `BOOKING_TRANSITION`, which nothing on the backend ever produces, and
  // this test faked that same wrong string: both green, and the real branch
  // dead. See `cancel-dialog.tsx`'s own comment on `moved` for the history.
  it("says the booking has already moved on, and still drops the cache, on a transition refusal", async () => {
    fakes.graphql.mockRejectedValue(refusal("BOOKING_INVALID_TRANSITION"));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { onClose } = renderDialog(qc);

    await userEvent.click(screen.getByRole("button", { name: "Cancelar reserva" }));

    expect(await screen.findByText(/já avançou/)).toBeInTheDocument();
    expect(screen.queryByText(/tente novamente/i)).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["bookings"] }),
    );
  });

  /**
   * I4. A dialog can sit open for minutes, which is how long a session takes
   * to lapse, so `UNAUTHENTICATED` is reachable — and it used to fall into
   * the generic refusal. Signing in again is the answer, and only this
   * sentence says so.
   */
  it("tells a signed-out customer to sign in again", async () => {
    fakes.graphql.mockRejectedValue(refusal("UNAUTHENTICATED"));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { onClose } = renderDialog(qc);

    await userEvent.click(screen.getByRole("button", { name: "Cancelar reserva" }));

    expect(
      await screen.findByText(
        "A sua sessão terminou. Inicie sessão outra vez para cancelar esta reserva.",
      ),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("says the booking is gone for BOOKING_NOT_FOUND", async () => {
    fakes.graphql.mockRejectedValue(refusal("BOOKING_NOT_FOUND"));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { onClose } = renderDialog(qc);

    await userEvent.click(screen.getByRole("button", { name: "Cancelar reserva" }));

    expect(await screen.findByText("Já não encontramos esta reserva.")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  // Every other refusal — a stranger's id, a dropped connection — gets the
  // generic message, which the dialog must not close over (it never
  // succeeded) and must not dress up as a retry that would work.
  it("stays open on any other refusal, without promising a retry", async () => {
    fakes.graphql.mockRejectedValue(refusal("NOT_BOOKING_CUSTOMER"));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { onClose } = renderDialog(qc);

    await userEvent.click(screen.getByRole("button", { name: "Cancelar reserva" }));

    expect(
      await screen.findByText("Não foi possível cancelar esta reserva."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/tente novamente/i)).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cancelar reserva" })).toBeInTheDocument();
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["bookings"] }),
    );
  });
});
