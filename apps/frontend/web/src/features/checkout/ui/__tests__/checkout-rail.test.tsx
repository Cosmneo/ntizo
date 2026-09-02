import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "@/shared/lib/i18n";
import { CheckoutRail } from "../checkout-rail";
import { compactSlotWording } from "@/features/checkout/domain/slot-wording";

/**
 * The rail on its own, because it is shared and its contract is the thing
 * step 2 and step 3 will be written against.
 *
 * Step 1's own suite already drives it through a real page, and that is the
 * right place to assert how *that* page fills it in. What that cannot do is
 * state what the component promises to callers who do not exist yet — which
 * props may be null and what happens when they are. Those are the cases a
 * later implementer will hit first and has nothing to read about otherwise:
 * a booking that carries no location type, a service with no priced package,
 * a business nobody has reviewed.
 */
const REQUIRED = {
  imageUrl: null,
  serviceName: "Corte de cabelo",
  providerName: "Hélder Cossa",
  providerRatingAverage: 4.8,
  providerVerified: true,
  optionName: "Corte e barba",
  slot: compactSlotWording(
    "2026-09-04T13:00:00.000Z",
    "2026-09-04T14:30:00.000Z",
    "pt-MZ",
    "Africa/Maputo",
  ),
  locationType: "at_customer",
  durationMinutes: 90,
  priceMinor: 90000,
  currency: "MZN",
} as const;

/**
 * The locale is pinned, not inherited: every assertion below reads Portuguese
 * copy and the suite's default resolves to English (`test/setup.ts` says so).
 */
beforeEach(async () => {
  await i18n.changeLanguage("pt-MZ");
});

afterEach(async () => {
  await i18n.changeLanguage("en-US");
});

describe("CheckoutRail", () => {
  it("prints the trust line: who, what they score, and whether they are verified", () => {
    render(<CheckoutRail {...REQUIRED} />);

    expect(screen.getByText("Hélder Cossa")).toBeInTheDocument();
    // "4,8" in pt-MZ — the reader's own decimal separator, and pinned to one
    // decimal so a business on a round 5 reads "5,0" rather than "5".
    expect(screen.getByText("4,8")).toBeInTheDocument();
    expect(screen.getByText("Verificado")).toBeInTheDocument();
  });

  it("says no score at all for a business nobody has reviewed", () => {
    // Null, never 0. Zero is a score a person could have given, and printing
    // it would tell the customer this is the worst provider on the platform.
    render(<CheckoutRail {...REQUIRED} providerRatingAverage={null} />);

    expect(screen.getByText("Hélder Cossa")).toBeInTheDocument();
    expect(screen.queryByText("0,0")).not.toBeInTheDocument();
    expect(screen.queryByText(/em 5/)).not.toBeInTheDocument();
  });

  it("drops the badge for a business the platform has not verified", () => {
    render(<CheckoutRail {...REQUIRED} providerVerified={false} />);

    expect(screen.queryByText("Verificado")).not.toBeInTheDocument();
    // The rest of the line survives on its own — the two halves are
    // independent, so an unverified business with reviews still shows them.
    expect(screen.getByText("4,8")).toBeInTheDocument();
  });

  it("renders with no price at all, for a service that has no priced package", () => {
    // **The contract the next implementer needs most.** A quote service has
    // no option, so there is no amount and no currency — and
    // `Intl.NumberFormat` throws `RangeError: Invalid currency code` on a
    // blank one rather than printing a zero. `priceMinor` is nullable for
    // exactly this, and passing `0` with `""` is not the workaround.
    render(<CheckoutRail {...REQUIRED} priceMinor={null} currency="" optionName={null} />);

    expect(screen.getByText("Corte de cabelo")).toBeInTheDocument();
    expect(screen.queryByText("Total")).not.toBeInTheDocument();
    expect(screen.queryByText(/MTn/)).not.toBeInTheDocument();
  });

  it("shows the travel line only where the provider is the one travelling", () => {
    const { unmount } = render(<CheckoutRail {...REQUIRED} locationType="at_customer" />);
    expect(screen.getByText("Deslocação")).toBeInTheDocument();
    expect(screen.getByText("Incluída")).toBeInTheDocument();
    unmount();

    // A barber's shop: the customer travels, so "deslocação incluída" would
    // be a false statement about money.
    render(<CheckoutRail {...REQUIRED} locationType="at_provider" />);
    expect(screen.queryByText("Deslocação")).not.toBeInTheDocument();
  });

  it("omits the travel line when the caller cannot know where the work happens", () => {
    // `null` is a real case rather than defensive typing: `bookingReadModel`
    // carries no location type, so the steps that have only a booking pass
    // nothing. Silence is the safe direction for a claim about money.
    render(<CheckoutRail {...REQUIRED} locationType={null} />);
    expect(screen.queryByText("Deslocação")).not.toBeInTheDocument();
  });

  it("never shows a fee, a commission or a cancellation promise", () => {
    render(<CheckoutRail {...REQUIRED} />);

    // Exactly two amounts — the service line and the total — and both the
    // package's own. A "Taxa Ntizo" row would be a third, and would change
    // the second.
    const amounts = screen
      .getAllByText(/MTn/)
      .map((node) => (node.textContent ?? "").replace(/\s+/g, " ").trim());
    expect(amounts).toEqual(["900,00 MTn", "900,00 MTn"]);
    expect(screen.queryByText(/comiss/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/taxa/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/cancelamento/i)).not.toBeInTheDocument();
  });

  it("states no total for an hourly package, whose length is not chosen yet", () => {
    render(<CheckoutRail {...REQUIRED} hourly />);

    expect(screen.queryByText("Total")).not.toBeInTheDocument();
    // The rate, with the per-hour suffix, rather than a figure a customer
    // would read as the price of the whole job.
    expect(screen.getByText("/h")).toBeInTheDocument();
  });

  it("says the QUANDO panel is waiting rather than leaving it blank", () => {
    render(<CheckoutRail {...REQUIRED} slot={null} />);
    expect(screen.getByText(/escolha uma data e uma hora/i)).toBeInTheDocument();
  });

  it("renders the slot in the timezone the caller worded it in", () => {
    // 13:00 UTC is 15:00 in Maputo, and it is the provider's clock that the
    // customer will be standing in front of. The rail is handed words rather
    // than instants precisely so it cannot re-format them in the device's
    // zone — the substitution that once drew step 1 an empty grid under a
    // live confirm button.
    render(<CheckoutRail {...REQUIRED} />);
    expect(screen.getByText(/15:00 – 16:30/)).toBeInTheDocument();
    // The weekday, which is the half of a date somebody actually checks.
    expect(screen.getByText(/sex/i)).toBeInTheDocument();
  });

  it("offers Alterar only when the caller has somewhere to send them", () => {
    // Step 1 is where the slot is chosen, so it passes no handler and the
    // control is absent — a button pointing at the grid two inches to its
    // left would do nothing.
    const { unmount } = render(<CheckoutRail {...REQUIRED} />);
    expect(screen.queryByRole("button", { name: /alterar/i })).not.toBeInTheDocument();
    unmount();

    const onChangeSlot = vi.fn();
    render(<CheckoutRail {...REQUIRED} onChangeSlot={onChangeSlot} />);
    return userEvent.click(screen.getByRole("button", { name: /alterar/i })).then(() => {
      expect(onChangeSlot).toHaveBeenCalledTimes(1);
    });
  });

  it("carries the step's own countdown and action area", () => {
    render(
      <CheckoutRail
        {...REQUIRED}
        countdown={<p>Hora reservada 29:00</p>}
        children={<button type="button">Enviar pedido</button>}
      />,
    );

    expect(screen.getByText("Hora reservada 29:00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar pedido" })).toBeInTheDocument();
  });

  it("keeps the two trust promises the platform can actually make", () => {
    render(<CheckoutRail {...REQUIRED} />);
    expect(screen.getByText(/pagamento fica retido/i)).toBeInTheDocument();
    expect(screen.getByText(/documentos do prestador verificados/i)).toBeInTheDocument();
  });
});
