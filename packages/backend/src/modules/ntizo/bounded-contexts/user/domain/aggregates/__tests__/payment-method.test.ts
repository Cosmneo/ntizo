import { describe, expect, it } from "bun:test";
import { PaymentDirection, PaymentMethodType } from "@ntizo/shared";
import { PaymentMethod } from "../payment-method.aggregate";

const base = {
  id: "pm-1",
  userId: "u-1",
  country: "MZ",
  direction: PaymentDirection.Charge,
};

describe("PaymentMethod — identifier normalisation", () => {
  it("stores a mobile money number in E.164", () => {
    // The same wallet written two ways must not become two saved methods.
    const spaced = PaymentMethod.create({
      ...base,
      type: PaymentMethodType.MPesa,
      identifier: "+258 84 987 6543",
    });
    const compact = PaymentMethod.create({
      ...base,
      type: PaymentMethodType.MPesa,
      identifier: "+258849876543",
    });
    expect(spaced.toJSON().identifier).toBe("+258849876543");
    expect(compact.toJSON().identifier).toBe(spaced.toJSON().identifier);
  });

  it("rejects a mobile money number with no country code", () => {
    // Bare national digits are ambiguous across the markets served, and the
    // column is what a payout is sent to.
    expect(() =>
      PaymentMethod.create({
        ...base,
        type: PaymentMethodType.MPesa,
        identifier: "849876543",
      }),
    ).toThrow();
  });

  it("strips the spaces humans write into an IBAN", () => {
    const method = PaymentMethod.create({
      ...base,
      type: PaymentMethodType.BankAccount,
      identifier: "pt50 0002 0123 1234 5678 9015 4",
    });
    expect(method.toJSON().identifier).toBe("PT50000201231234567890154");
  });

  it("rejects an account number too short to be one", () => {
    expect(() =>
      PaymentMethod.create({
        ...base,
        type: PaymentMethodType.BankAccount,
        identifier: "12345",
      }),
    ).toThrow();
  });
});

describe("PaymentMethod — direction", () => {
  it("refuses to make a card a payout method", () => {
    // Card networks push refunds back to the original charge; they do not
    // accept arbitrary payouts. The picker only offers legal combinations,
    // and the picker is not the thing that has to be right.
    expect(() =>
      PaymentMethod.create({
        ...base,
        type: PaymentMethodType.Card,
        direction: PaymentDirection.Payout,
        identifier: "tok_abcdefgh",
      }),
    ).toThrow();
  });

  it("allows mobile money in both directions", () => {
    for (const direction of [PaymentDirection.Charge, PaymentDirection.Payout]) {
      const method = PaymentMethod.create({
        ...base,
        direction,
        type: PaymentMethodType.MPesa,
        identifier: "+258849876543",
      });
      expect(method.direction).toBe(direction);
    }
  });
});

describe("PaymentMethod — label", () => {
  it("derives a masked label when the user does not give one", () => {
    // Two M-Pesa numbers in a list are indistinguishable without it.
    const method = PaymentMethod.create({
      ...base,
      type: PaymentMethodType.MPesa,
      identifier: "+258849876543",
    });
    expect(method.toJSON().label).toBe("···6543");
  });

  it("shows only the last four digits, never the whole identifier", () => {
    const method = PaymentMethod.create({
      ...base,
      type: PaymentMethodType.BankAccount,
      identifier: "PT50000201231234567890154",
    });
    expect(method.toJSON().label).not.toContain("PT50");
    expect(method.toJSON().label).toBe("···0154");
  });

  it("keeps the user's own name when they give one", () => {
    const method = PaymentMethod.create({
      ...base,
      type: PaymentMethodType.MPesa,
      identifier: "+258849876543",
      label: "  Conta principal  ",
    });
    expect(method.toJSON().label).toBe("Conta principal");
  });

  it("falls back to the mask when a rename empties the label", () => {
    const method = PaymentMethod.create({
      ...base,
      type: PaymentMethodType.MPesa,
      identifier: "+258849876543",
      label: "Conta principal",
    });
    method.rename("   ");
    expect(method.toJSON().label).toBe("···6543");
  });
});
