import { describe, expect, it } from "vitest";
import {
  WalletEntryType,
  countsAsEarning,
  deltasFor,
  wouldOverdraw,
} from "../index";

/** 1 500,00 MZN in centavos. Every amount here is an integer, on purpose. */
const PRICE = 150_000;

describe("deltasFor", () => {
  it("puts a new booking's money in pending, not available", () => {
    // The customer has paid; the work has not happened. Money that might still
    // be refunded is not the provider's to withdraw.
    expect(deltasFor(WalletEntryType.BookingEarning, PRICE)).toEqual({
      availableDeltaMinor: 0,
      pendingDeltaMinor: PRICE,
    });
  });

  it("moves both balances in one entry when an earning is released", () => {
    // One event, one row. Two rows would leave a moment where a reader sees
    // the money in neither balance.
    expect(deltasFor(WalletEntryType.EarningReleased, PRICE)).toEqual({
      availableDeltaMinor: PRICE,
      pendingDeltaMinor: -PRICE,
    });
  });

  it("conserves the total across a release", () => {
    const d = deltasFor(WalletEntryType.EarningReleased, PRICE);
    expect(d.availableDeltaMinor + d.pendingDeltaMinor).toBe(0);
  });

  it("records cash without moving any balance", () => {
    // The platform never held it. Claiming it as a balance is a lie the
    // provider discovers at withdrawal.
    expect(deltasFor(WalletEntryType.CashSettlement, PRICE)).toEqual({
      availableDeltaMinor: 0,
      pendingDeltaMinor: 0,
    });
  });

  it("takes a payout out of available only", () => {
    expect(deltasFor(WalletEntryType.Payout, PRICE)).toEqual({
      availableDeltaMinor: -PRICE,
      pendingDeltaMinor: 0,
    });
  });

  it("returns a failed payout to available", () => {
    const out = deltasFor(WalletEntryType.Payout, PRICE);
    const back = deltasFor(WalletEntryType.PayoutReversed, PRICE);
    expect(out.availableDeltaMinor + back.availableDeltaMinor).toBe(0);
  });

  it("refunds a pending booking out of pending", () => {
    // It never reached available. Taking it from there would push the provider
    // negative on money they never had.
    expect(
      deltasFor(WalletEntryType.Refund, PRICE, { fromPending: true }),
    ).toEqual({ availableDeltaMinor: 0, pendingDeltaMinor: -PRICE });
  });

  it("refunds a released booking out of available", () => {
    expect(deltasFor(WalletEntryType.Refund, PRICE)).toEqual({
      availableDeltaMinor: -PRICE,
      pendingDeltaMinor: 0,
    });
  });

  it("ignores the sign of the amount except where a sign is the point", () => {
    // Callers pass a positive amount and the type decides the direction —
    // except a manual adjustment, which is a correction and goes either way.
    expect(deltasFor(WalletEntryType.Payout, -PRICE).availableDeltaMinor).toBe(-PRICE);
    expect(
      deltasFor(WalletEntryType.ManualAdjustment, -PRICE).availableDeltaMinor,
    ).toBe(-PRICE);
    expect(
      deltasFor(WalletEntryType.ManualAdjustment, PRICE).availableDeltaMinor,
    ).toBe(PRICE);
  });

  it("has a rule for every type", () => {
    // A type with no rule would silently move nothing, which reads as an entry
    // that was written and did not count.
    for (const type of Object.values(WalletEntryType)) {
      expect(deltasFor(type, PRICE)).toBeDefined();
    }
  });
});

describe("a booking's life, end to end", () => {
  it("lands, releases, and pays out to zero", () => {
    let available = 0;
    let pending = 0;
    const apply = (t: WalletEntryType, amount = PRICE) => {
      const d = deltasFor(t, amount);
      available += d.availableDeltaMinor;
      pending += d.pendingDeltaMinor;
    };

    apply(WalletEntryType.BookingEarning);
    expect({ available, pending }).toEqual({ available: 0, pending: PRICE });

    apply(WalletEntryType.EarningReleased);
    expect({ available, pending }).toEqual({ available: PRICE, pending: 0 });

    apply(WalletEntryType.Payout);
    expect({ available, pending }).toEqual({ available: 0, pending: 0 });
  });

  it("leaves nothing behind when a pending booking is refunded", () => {
    let pending = deltasFor(WalletEntryType.BookingEarning, PRICE).pendingDeltaMinor;
    pending += deltasFor(WalletEntryType.Refund, PRICE, {
      fromPending: true,
    }).pendingDeltaMinor;
    expect(pending).toBe(0);
  });
});

describe("countsAsEarning", () => {
  it("counts cash, which the platform never held", () => {
    // The provider earned it. A total that excludes it is a total they will
    // not recognise as theirs.
    expect(countsAsEarning(WalletEntryType.CashSettlement)).toBe(true);
  });

  it("counts a booking's earning once, at the point it lands", () => {
    // Not again on release: the same money would be counted twice.
    expect(countsAsEarning(WalletEntryType.BookingEarning)).toBe(true);
    expect(countsAsEarning(WalletEntryType.EarningReleased)).toBe(false);
  });

  it("does not count a payout as earning", () => {
    // Withdrawing money you earned is not earning it again.
    expect(countsAsEarning(WalletEntryType.Payout)).toBe(false);
  });
});

describe("wouldOverdraw", () => {
  const balances = { availableMinor: 10_000, pendingMinor: 5_000 };

  it("allows what fits", () => {
    expect(
      wouldOverdraw(balances, deltasFor(WalletEntryType.Payout, 10_000)),
    ).toBe(false);
  });

  it("refuses a payout larger than the balance", () => {
    // A negative balance here is not a smaller number — it is money already
    // sent to somebody's phone that cannot be pulled back.
    expect(
      wouldOverdraw(balances, deltasFor(WalletEntryType.Payout, 10_001)),
    ).toBe(true);
  });

  it("checks pending independently of available", () => {
    // Plenty in available must not authorise draining more from pending than
    // is there.
    expect(
      wouldOverdraw(
        balances,
        deltasFor(WalletEntryType.Refund, 6_000, { fromPending: true }),
      ),
    ).toBe(true);
  });

  it("lets a balance reach exactly zero", () => {
    expect(
      wouldOverdraw(balances, deltasFor(WalletEntryType.Refund, 5_000, { fromPending: true })),
    ).toBe(false);
  });
});
