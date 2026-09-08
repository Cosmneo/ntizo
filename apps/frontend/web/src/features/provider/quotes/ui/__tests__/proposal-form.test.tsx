import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "@/shared/lib/i18n";
import { ProposalForm } from "../proposal-form";

/**
 * The props every test starts from: one performer (so the member field
 * preselects itself out of the way), a round commission rate, and MZN — the
 * only currency this launch prices in. Individual tests override only the
 * one prop their name is about.
 */
const DEFAULT_PROPS = {
  commissionBps: 1000,
  currency: "MZN",
  performers: [{ id: "m1", firstName: "Carlos" }],
  timezone: "Africa/Maputo",
  busy: false,
} as const;

/**
 * Every field the form's own validation asks for, filled with values that
 * pass it — so a test about one behaviour (the split, the instant, the
 * minor units) does not also have to fight the ones it is not about.
 *
 * Africa/Maputo is UTC+2 all year, so "2026-09-20" at "08:30" is the fixture
 * `toInstant`'s own test pins to "2026-09-20T06:30:00.000Z".
 */
async function fillValidProposal(
  overrides: { date?: string; time?: string; hours?: string } = {},
) {
  const { date = "2026-09-20", time = "08:30", hours = "2" } = overrides;
  await userEvent.type(screen.getByLabelText("Preço para o cliente"), "9800");
  fireEvent.change(screen.getByLabelText("Data"), { target: { value: date } });
  fireEvent.change(screen.getByLabelText("Hora"), { target: { value: time } });
  await userEvent.type(screen.getByLabelText("Duração"), hours);
}

beforeEach(async () => {
  await i18n.changeLanguage("pt-MZ");
});

afterEach(async () => {
  await i18n.changeLanguage("en-US");
});

describe("ProposalForm", () => {
  // `formatMoney(minor, "MZN", "pt-MZ")` is the authority for every literal
  // below, not the mockup's own prose: pt-MZ groups nothing at four digits,
  // spells the symbol "MTn" and never writes "MZN" as a word beside the
  // number. 9800 minor-major, 10% commission: 980,00 commission, 8820,00
  // payout, all in "MTn".
  it("shows the split the moment a price is typed, from the provider's own rate", async () => {
    render(<ProposalForm {...DEFAULT_PROPS} onSubmit={vi.fn()} />);

    await userEvent.type(await screen.findByLabelText("Preço para o cliente"), "9800");

    expect(screen.getByText("9800,00 MTn")).toBeInTheDocument();
    expect(screen.getByText("− 980,00 MTn")).toBeInTheDocument();
    expect(screen.getByText("8820,00 MTn")).toBeInTheDocument();
  });

  // The bug this pins: the field carried no unit at all, so a provider who
  // meant 20 minutes and typed "20" would have sent a binding 20-hour job —
  // it clears the 1..1440-minute check and reaches the customer. "h" is
  // rendered beside the input the same way the price field renders its own
  // `currency` — see `proposal-form.tsx`'s `propose.durationUnit`.
  it("labels the duration field with its unit, the way the price field labels its own", async () => {
    render(<ProposalForm {...DEFAULT_PROPS} onSubmit={vi.fn()} />);

    const durationField = await screen.findByLabelText("Duração");
    expect(durationField.parentElement).toHaveTextContent("h");
  });

  it("names the rate in the commission line, so the number is not a mystery", async () => {
    render(<ProposalForm {...DEFAULT_PROPS} commissionBps={1250} onSubmit={vi.fn()} />);

    await userEvent.type(await screen.findByLabelText("Preço para o cliente"), "100");

    expect(screen.getByText(/Comissão Ntizo \(12,5%\)/)).toBeInTheDocument();
  });

  it("rounds the commission the way the booking will, to the cent", async () => {
    // 5 minor units at 12.5% is 0.625 -> 1, which is Math.round's
    // half-away-from-zero.
    render(<ProposalForm {...DEFAULT_PROPS} commissionBps={1250} onSubmit={vi.fn()} />);

    await userEvent.type(await screen.findByLabelText("Preço para o cliente"), "0,05");

    expect(screen.getByText("− 0,01 MTn")).toBeInTheDocument();
  });

  it("sends the price in minor units, never the major number the provider typed", async () => {
    const onSubmit = vi.fn();
    render(<ProposalForm {...DEFAULT_PROPS} onSubmit={onSubmit} />);

    await fillValidProposal();
    await userEvent.click(screen.getByRole("button", { name: "Enviar proposta" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ priceMinor: 980_000 }));
  });

  it("builds the start from the date and the time in the provider's own zone", async () => {
    const onSubmit = vi.fn();
    render(<ProposalForm {...DEFAULT_PROPS} timezone="Africa/Maputo" onSubmit={onSubmit} />);

    await fillValidProposal({ date: "2026-09-20", time: "08:30" });
    await userEvent.click(screen.getByRole("button", { name: "Enviar proposta" }));

    // Africa/Maputo is UTC+2 all year.
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ startsAt: "2026-09-20T06:30:00.000Z" }),
    );
  });

  it("builds the same instant correctly in a zone with daylight saving too", async () => {
    // Europe/Lisbon is UTC+1 on 20 September (still in its summer clock),
    // not the Africa/Maputo fixture's +2 — an implementation that hard-coded
    // +2 would pass the test above and fail silently everywhere else.
    const onSubmit = vi.fn();
    render(<ProposalForm {...DEFAULT_PROPS} timezone="Europe/Lisbon" onSubmit={onSubmit} />);

    await fillValidProposal({ date: "2026-09-20", time: "08:30" });
    await userEvent.click(screen.getByRole("button", { name: "Enviar proposta" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ startsAt: "2026-09-20T07:30:00.000Z" }),
    );
  });

  it("refuses a price of nothing before it sends", async () => {
    const onSubmit = vi.fn();
    render(<ProposalForm {...DEFAULT_PROPS} onSubmit={onSubmit} />);

    await userEvent.click(await screen.findByRole("button", { name: "Enviar proposta" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Escreva o preço.");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("preselects the only member rather than making the provider choose from a list of one", async () => {
    render(<ProposalForm {...DEFAULT_PROPS} onSubmit={vi.fn()} />);

    expect(await screen.findByLabelText("Quem faz o trabalho")).toHaveValue("m1");
  });

  it("opens pre-filled from initialValues, for a revision", async () => {
    render(
      <ProposalForm
        {...DEFAULT_PROPS}
        onSubmit={vi.fn()}
        initialValues={{
          price: "9800,00",
          date: "2026-09-20",
          time: "08:30",
          durationHours: "4",
          memberId: "m1",
          note: "Traga escada.",
        }}
      />,
    );

    expect(await screen.findByLabelText("Preço para o cliente")).toHaveValue("9800,00");
    expect(screen.getByLabelText("Data")).toHaveValue("2026-09-20");
    expect(screen.getByLabelText("Hora")).toHaveValue("08:30");
    expect(screen.getByLabelText("Duração")).toHaveValue("4");
    expect(screen.getByLabelText("Quem faz o trabalho")).toHaveValue("m1");
    expect(screen.getByLabelText(/Nota para o cliente/)).toHaveValue("Traga escada.");
    // The split already knows what a filled-in price means, from the very
    // first render — the provider does not have to retype the price to see
    // what revising it would change.
    expect(screen.getByText("9800,00 MTn")).toBeInTheDocument();
  });

  it("opens blank when there are no initialValues, exactly as before this prop existed", async () => {
    render(<ProposalForm {...DEFAULT_PROPS} onSubmit={vi.fn()} />);

    expect(await screen.findByLabelText("Preço para o cliente")).toHaveValue("");
    expect(screen.getByLabelText("Data")).toHaveValue("");
    expect(screen.getByLabelText("Hora")).toHaveValue("");
    expect(screen.getByLabelText("Duração")).toHaveValue("");
    expect(screen.getByLabelText(/Nota para o cliente/)).toHaveValue("");
  });
});
