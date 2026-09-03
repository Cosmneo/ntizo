import { describe, expect, it } from "vitest";
import { STATUS_TONE, commissionRate, payoutMinor, shortReference, timeLeft } from "../status";

describe("bookings domain", () => {
  it("maps every provider-visible status to a tone, warning for the one that needs an answer", () => {
    expect(STATUS_TONE.AWAITING_PROVIDER).toBe("warning");
    expect(STATUS_TONE.CONFIRMED).toBe("success");
    expect(STATUS_TONE.DECLINED).toBe("danger");
    expect(STATUS_TONE.EXPIRED).toBe("neutral");
  });
  it("the reference is the first eight characters of the id, uppercased", () => {
    expect(shortReference("a1b2c3d4-e5f6-7890")).toBe("A1B2C3D4");
  });
  it("the payout is the price less the commission", () => {
    expect(payoutMinor({ priceMinor: 80000, commissionMinor: 8000 })).toBe(72000);
  });
  it("the rate prints as a percentage in the reader's locale", () => {
    expect(commissionRate(1000, "pt-MZ")).toBe("10%");
    expect(commissionRate(1250, "en-US")).toBe("12.5%");
  });
  it("time left counts down in hours, then minutes, then says it passed", () => {
    const now = new Date("2026-09-04T10:00:00.000Z");
    expect(timeLeft("2026-09-04T12:30:00.000Z", now)).toEqual({ minutes: 150, label: "hours" });
    expect(timeLeft("2026-09-04T10:20:00.000Z", now)).toEqual({ minutes: 20, label: "minutes" });
    expect(timeLeft("2026-09-04T09:00:00.000Z", now)).toEqual({ minutes: 0, label: "past" });
  });
});
