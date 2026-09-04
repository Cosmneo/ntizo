import { describe, expect, it } from "vitest";
import { STATUS_TONE, canCancel, canPay, upcomingSteps } from "../status";
import type { CustomerBookingStatus } from "../status";

const EVERY_STATUS = Object.keys(STATUS_TONE) as CustomerBookingStatus[];

describe("upcomingSteps", () => {
  it("promises payment and confirmation while the provider is still deciding", () => {
    // Not the deciding itself: the server's own timeline already carries it
    // as the pending `respond_by` hop, and naming it twice would draw the
    // same wait as two separate steps.
    expect(upcomingSteps("AWAITING_PROVIDER")).toEqual(["payment", "confirmed"]);
  });

  it("promises only the confirmation once the payment is what is being waited for", () => {
    // Same rule, one hop later: `pay_by` is on the server's timeline, so the
    // payment is not repeated here.
    expect(upcomingSteps("PENDING_PAYMENT")).toEqual(["confirmed"]);
  });

  it("promises nothing after a booking is confirmed", () => {
    // The honest answer, not an oversight. Work happening, being marked done
    // and money being released are all real steps of the design and none of
    // them has a transition: `MARKED_DONE`, `COMPLETED` and `DISPUTED` are
    // enum values no code path reaches. A ladder drawn from the design
    // instead of from the machine would promise a customer three steps the
    // platform cannot take.
    expect(upcomingSteps("CONFIRMED")).toEqual([]);
  });

  it("promises nothing on any status that is over", () => {
    for (const status of ["DECLINED", "CANCELLED", "EXPIRED"] as const) {
      expect(upcomingSteps(status)).toEqual([]);
    }
  });

  it("answers for every status the model can carry, and only ever with steps the machine has", () => {
    // The guard against a status added later falling through to `undefined`
    // and taking `.map` down with it — and against a step name being
    // introduced with no word in any locale, since these two are the only
    // ones `timeline.ahead.*` defines.
    for (const status of EVERY_STATUS) {
      const steps = upcomingSteps(status);
      expect(Array.isArray(steps)).toBe(true);
      for (const step of steps) expect(["payment", "confirmed"]).toContain(step);
    }
  });

  it("never promises a step to a booking that cannot still be acted on", () => {
    // The invariant behind the three cases above, stated once: something is
    // still ahead exactly when the customer can still cancel or pay. A future
    // status that breaks this pair breaks one of them visibly.
    for (const status of EVERY_STATUS) {
      const hasFuture = upcomingSteps(status).length > 0;
      expect(hasFuture).toBe(canCancel(status) || canPay(status));
    }
  });
});
