import { describe, expect, it } from "vitest";
import { NTIZO_COMMISSION_RATE, bookingTotal } from "../booking-total";

describe("bookingTotal", () => {
  it("adds ten percent to the package price", () => {
    // The mockup's own numbers: 500 + 50 = 550.
    expect(bookingTotal(50000)).toEqual({
      packageMinor: 50000,
      commissionMinor: 5000,
      totalMinor: 55000,
    });
  });

  it("rounds the commission to whole minor units", () => {
    // 333.33 MZN at 10% is 33.333 — a third of a centavo cannot be charged,
    // and a fraction reaching a payment provider is a rejected transaction.
    const t = bookingTotal(33333);
    expect(Number.isInteger(t.commissionMinor)).toBe(true);
    expect(t.commissionMinor).toBe(3333);
  });

  it("keeps the total exactly the sum of its two parts", () => {
    // The invariant the receipt depends on. Rounding each part separately is
    // how a line-item breakdown stops adding up to its own total.
    for (const amount of [1, 7, 99, 12345, 33333, 99999, 100000001]) {
      const t = bookingTotal(amount);
      expect(t.packageMinor + t.commissionMinor).toBe(t.totalMinor);
    }
  });

  it("charges nothing on nothing", () => {
    expect(bookingTotal(0)).toEqual({
      packageMinor: 0,
      commissionMinor: 0,
      totalMinor: 0,
    });
  });

  it("exposes the rate so the UI can name it without restating it", () => {
    expect(NTIZO_COMMISSION_RATE).toBe(0.1);
  });
});
