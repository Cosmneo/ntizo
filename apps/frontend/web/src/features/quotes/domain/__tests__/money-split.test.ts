import { describe, expect, it } from "vitest";
import { commissionMinorOf, payoutMinorOf } from "@/features/quotes/domain/money-split";

describe("the split the provider is deciding on", () => {
  it("takes ten per cent of 9 800 MZN exactly as the booking does", () => {
    expect(commissionMinorOf(980_000, 1000)).toBe(98_000);
    expect(payoutMinorOf(980_000, 1000)).toBe(882_000);
  });

  it("rounds half away from zero, which is what Math.round does and what the booking stores", () => {
    // 1 cent at 12.5% is 0.125 -> 0; 3 cents is 0.375 -> 0; 5 cents is 0.625 -> 1.
    expect(commissionMinorOf(1, 1250)).toBe(0);
    expect(commissionMinorOf(3, 1250)).toBe(0);
    expect(commissionMinorOf(5, 1250)).toBe(1);
    // 4 cents at 12.5% is 0.5 exactly — the one input in this file that
    // actually lands on the tie `Math.round` breaks by rounding up, rather
    // than landing just short of or past it the way the other three cases
    // here do. This is the branch's highest-stakes arithmetic, so the exact
    // tie is worth pinning, not just its neighbours.
    expect(commissionMinorOf(4, 1250)).toBe(1);
  });

  it("gives the whole price away at 100% and nothing at 0%", () => {
    expect(payoutMinorOf(500_00, 10_000)).toBe(0);
    expect(commissionMinorOf(500_00, 0)).toBe(0);
  });

  it("never leaves a cent unaccounted for", () => {
    for (const price of [1, 7, 99, 1234, 980_000]) {
      expect(commissionMinorOf(price, 1000) + payoutMinorOf(price, 1000)).toBe(price);
    }
  });
});
