import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PAYOUT_CAPABLE_TYPES, PaymentMethodType } from "@ntizo/shared";
import { PhasePayout } from "@/features/onboarding/ui/phases/phase-payout";
import type { ProviderDraft } from "@/features/onboarding/domain/draft";

/**
 * Only M-Pesa is offered here, and that is narrower than what the platform can
 * pay out to. These tests pin the gap deliberately: the whole point of hiding
 * e-Mola and bank transfer in the UI rather than removing them from
 * `PAYOUT_CAPABLE_TYPES` is that providers already saved on those two keep
 * working, so a future edit that "tidies up" by narrowing the shared constant
 * should fail here rather than in production.
 */
function draftWith(patch: Partial<ProviderDraft> = {}): ProviderDraft {
  return { payoutType: "", payoutIdentifier: "", ...patch } as ProviderDraft;
}

function renderPayout(patch: Partial<ProviderDraft> = {}) {
  const onChange = vi.fn();
  render(
    <PhasePayout
      draft={draftWith(patch)}
      onChange={onChange}
      onBack={vi.fn()}
      onContinue={vi.fn()}
    />,
  );
  return { onChange };
}

describe("PhasePayout", () => {
  it("offers M-Pesa and nothing else", () => {
    renderPayout();

    const options = screen.getAllByRole("radio");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent("M-Pesa");
  });

  it("does not offer e-Mola or a bank account", () => {
    renderPayout();

    expect(screen.queryByText("e-Mola")).toBeNull();
    expect(screen.queryByText("Bank account")).toBeNull();
    // The bank option's own copy is the only place "NIB" appears on this
    // screen, so its absence is what proves the row is gone rather than
    // merely relabelled.
    expect(screen.queryByText(/NIB/)).toBeNull();
  });

  it("still selects M-Pesa and asks for the number", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPayout();

    await user.click(screen.getByRole("radio"));

    expect(onChange).toHaveBeenCalledWith({
      payoutType: PaymentMethodType.MPesa,
      payoutIdentifier: "",
    });
  });

  it("leaves the platform's payout-capable set untouched", () => {
    // Hiding is a presentation choice. If this ever fails, the shared
    // constant was narrowed too, and every provider already on e-Mola or a
    // bank account just became invalid.
    expect(PAYOUT_CAPABLE_TYPES).toContain(PaymentMethodType.EMola);
    expect(PAYOUT_CAPABLE_TYPES).toContain(PaymentMethodType.BankAccount);
  });
});
