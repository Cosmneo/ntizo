import { describe, expect, it } from "vitest";
import {
  canAccept, canDecline, canPropose, canReject, canWithdraw,
  clockOf, coarseDuration, customerTone, providerTone, revisionCount,
} from "@/features/quotes/domain/status";

describe("tone", () => {
  it("reads REQUESTED as waiting for the customer and as the provider's move", () => {
    expect(customerTone("REQUESTED")).toBe("waiting");
    expect(providerTone("REQUESTED")).toBe("yours");
  });

  it("reads PROPOSED the other way round", () => {
    expect(customerTone("PROPOSED")).toBe("yours");
    expect(providerTone("PROPOSED")).toBe("waiting");
  });

  it("agrees on every terminal status, because those are nobody's turn", () => {
    for (const status of ["ACCEPTED", "DECLINED", "REJECTED", "WITHDRAWN", "EXPIRED"] as const) {
      expect(customerTone(status)).toBe(providerTone(status));
    }
    expect(customerTone("ACCEPTED")).toBe("done");
    expect(customerTone("DECLINED")).toBe("refused");
    expect(customerTone("REJECTED")).toBe("refused");
    expect(customerTone("WITHDRAWN")).toBe("gone");
    expect(customerTone("EXPIRED")).toBe("gone");
  });
});

describe("actions", () => {
  const at = (status: string) => ({ status }) as never;

  it("lets the customer accept and reject only a live proposal", () => {
    expect(canAccept({ status: "PROPOSED", proposal: { id: "p1" } } as never)).toBe(true);
    expect(canAccept({ status: "PROPOSED", proposal: null } as never)).toBe(false);
    expect(canAccept({ status: "REQUESTED", proposal: null } as never)).toBe(false);
    expect(canReject(at("PROPOSED"))).toBe(true);
    expect(canReject(at("REQUESTED"))).toBe(false);
  });

  it("lets the customer withdraw only before a proposal exists", () => {
    expect(canWithdraw(at("REQUESTED"))).toBe(true);
    expect(canWithdraw(at("PROPOSED"))).toBe(false);
  });

  it("lets the provider answer while the quote is open, revision included", () => {
    expect(canPropose(at("REQUESTED"))).toBe(true);
    expect(canPropose(at("PROPOSED"))).toBe(true);
    expect(canPropose(at("ACCEPTED"))).toBe(false);
    expect(canDecline(at("REQUESTED"))).toBe(true);
    expect(canDecline(at("PROPOSED"))).toBe(true);
    expect(canDecline(at("EXPIRED"))).toBe(false);
  });
});

describe("clockOf", () => {
  const base = { expiresAt: "2026-09-05T10:12:00.000Z", expiredCause: null, closedReason: null,
                 requestedAt: "2026-09-03T10:12:00.000Z", proposal: null };

  it("points a REQUESTED quote at the provider's deadline", () => {
    expect(clockOf({ ...base, status: "REQUESTED" } as never))
      .toEqual({ kind: "respondBy", at: "2026-09-05T10:12:00.000Z" });
  });

  it("points a PROPOSED quote at the proposal's validity, not the quote's row", () => {
    expect(clockOf({ ...base, status: "PROPOSED",
      expiresAt: "2026-09-07T16:40:00.000Z",
      proposal: { validUntil: "2026-09-07T16:40:00.000Z" } } as never))
      .toEqual({ kind: "decideBy", at: "2026-09-07T16:40:00.000Z" });
  });

  it("says an accepted quote became a booking rather than repeating a deadline", () => {
    expect(clockOf({ ...base, status: "ACCEPTED" } as never)).toEqual({ kind: "becameBooking" });
  });

  it("carries the cause of an expiry, so nobody has to guess who dropped it", () => {
    expect(clockOf({ ...base, status: "EXPIRED", expiredCause: "provider_did_not_respond" } as never))
      .toEqual({ kind: "expired", cause: "provider_did_not_respond", at: "2026-09-05T10:12:00.000Z" });
  });

  it("says why a refused quote closed, because there is no timestamp for when", () => {
    expect(clockOf({ ...base, status: "DECLINED", closedReason: "outside_area" } as never))
      .toEqual({ kind: "closedReason", reason: "outside_area" });
    expect(clockOf({ ...base, status: "WITHDRAWN", closedReason: "other" } as never))
      .toEqual({ kind: "closedReason", reason: "other" });
  });

  it("falls back to nothing rather than inventing a date it does not have", () => {
    expect(clockOf({ ...base, status: "EXPIRED", expiredCause: null, expiresAt: null } as never))
      .toEqual({ kind: "none" });
    expect(clockOf({ ...base, status: "REJECTED", closedReason: null } as never))
      .toEqual({ kind: "none" });
  });
});

describe("coarseDuration", () => {
  it("counts whole minutes under an hour", () => {
    expect(coarseDuration(45 * 60_000)).toEqual({ unit: "min", count: 45 });
  });

  it("counts whole hours up to two days, which is how the mockup reads a 48 h clock", () => {
    expect(coarseDuration(22 * 3_600_000)).toEqual({ unit: "h", count: 22 });
    expect(coarseDuration(26 * 3_600_000)).toEqual({ unit: "h", count: 26 });
  });

  it("switches to days past 48 hours", () => {
    expect(coarseDuration(50 * 3_600_000)).toEqual({ unit: "d", count: 2 });
  });

  it("returns null for a span that has already run out", () => {
    expect(coarseDuration(0)).toBeNull();
    expect(coarseDuration(-1)).toBeNull();
  });
});

describe("revisionCount", () => {
  it("counts only proposals the provider replaced, never one a taken slot killed", () => {
    expect(revisionCount([
      { supersededCause: "revised" }, { supersededCause: "slot_taken" }, { supersededCause: null },
    ])).toBe(1);
  });
});
