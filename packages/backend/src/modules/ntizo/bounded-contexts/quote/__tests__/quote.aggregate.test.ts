import { describe, expect, it } from "bun:test";
import { Quote, type QuoteAddress } from "../domain/aggregates/quote.aggregate";
import {
  QuoteAddressRequiredError,
  QuoteFieldBlankError,
  QuotePriceBelowMinimumError,
  QuoteProposalLapsedError,
  QuoteStartsInPastError,
  QuoteTransitionError,
} from "../domain/exceptions";

const NOW = new Date("2026-09-07T10:00:00Z");
const IN_48H = new Date(NOW.getTime() + 48 * 3_600_000);
const NEXT_WEEK = new Date(NOW.getTime() + 7 * 24 * 3_600_000);
const ADDRESS: QuoteAddress = {
  label: "Casa", line: "Av. Julius Nyerere 1234", city: "Maputo",
  district: "Bairro Central", directions: null, lat: null, lng: null,
};

function requested(over: Partial<Parameters<typeof Quote.request>[0]> = {}) {
  return Quote.request({
    id: "q-1", serviceId: "svc-1", providerId: "prov-1", customerId: "cust-1", threadId: "thr-1",
    locale: "pt-MZ", description: "Dois aparelhos split", neededBy: "2026-09-27",
    address: ADDRESS, at: NOW, respondBy: IN_48H, ...over,
  });
}

function proposeInput(over: Partial<Parameters<Quote["propose"]>[0]> = {}) {
  return {
    priceMinor: 9_800, currency: "MZN", startsAt: NEXT_WEEK, durationMinutes: 240,
    providerMemberId: "mem-1", note: "Inclui tubagem", validUntil: new Date(NOW.getTime() + 72 * 3_600_000),
    createdByUserId: "user-prov", at: NOW, minPriceMinor: 5_000, ...over,
  };
}

describe("Quote.request", () => {
  it("starts REQUESTED with the response clock and no proposals", () => {
    const q = requested();
    expect(q.status).toBe("REQUESTED");
    expect(q.expiresAt).toEqual(IN_48H);
    expect(q.proposals).toEqual([]);
    expect(q.liveProposal).toBeNull();
    expect(q.hasCompleteAddress()).toBe(true);
  });

  it("refuses a blank description and a blank address line, but allows no address at all", () => {
    expect(() => requested({ description: "   " })).toThrow(QuoteFieldBlankError);
    expect(() => requested({ address: { ...ADDRESS, line: "" } })).toThrow(QuoteFieldBlankError);
    expect(requested({ address: null }).hasCompleteAddress()).toBe(false);
  });
});

describe("Quote.propose", () => {
  it("moves REQUESTED to PROPOSED with one live proposal and the validity clock", () => {
    const q = requested().propose(proposeInput());
    expect(q.status).toBe("PROPOSED");
    expect(q.proposals).toHaveLength(1);
    expect(q.liveProposal?.endsAt).toEqual(new Date(NEXT_WEEK.getTime() + 240 * 60_000));
    expect(q.expiresAt).toEqual(proposeInput().validUntil);
    expect(q.proposedAt).toEqual(NOW);
  });

  it("a revision supersedes the live proposal as 'revised' and never edits it", () => {
    const first = requested().propose(proposeInput({ priceMinor: 10_600 }));
    const later = new Date(NOW.getTime() + 3_600_000);
    const second = first.propose(proposeInput({ priceMinor: 9_800, at: later }));
    expect(second.proposals).toHaveLength(2);
    expect(second.proposals[0]).toMatchObject({ priceMinor: 10_600, supersededAt: later, supersededCause: "revised" });
    expect(second.liveProposal).toMatchObject({ priceMinor: 9_800, supersededAt: null });
  });

  it("refuses a price below the minimum, a start in the past, and a closed quote", () => {
    expect(() => requested().propose(proposeInput({ priceMinor: 4_999 }))).toThrow(QuotePriceBelowMinimumError);
    expect(() => requested().propose(proposeInput({ startsAt: NOW }))).toThrow(QuoteStartsInPastError);
    const declined = requested().decline(NOW, "user-prov", "outside_area", null);
    expect(() => declined.propose(proposeInput())).toThrow(QuoteTransitionError);
  });
});

describe("Quote.accept", () => {
  it("closes the quote with the booking id and no clock", () => {
    const q = requested().propose(proposeInput()).accept(NOW, "bk-1");
    expect(q.status).toBe("ACCEPTED");
    expect(q.bookingId).toBe("bk-1");
    expect(q.expiresAt).toBeNull();
    expect(q.acceptedAt).toEqual(NOW);
  });

  it("refuses after the validity passed, without an address, and from REQUESTED", () => {
    const proposed = requested().propose(proposeInput());
    const afterValidity = new Date(proposeInput().validUntil.getTime() + 1);
    expect(() => proposed.accept(afterValidity, "bk-1")).toThrow(QuoteProposalLapsedError);
    expect(() => requested({ address: null }).propose(proposeInput()).accept(NOW, "bk-1")).toThrow(QuoteAddressRequiredError);
    expect(() => requested().accept(NOW, "bk-1")).toThrow(QuoteTransitionError);
  });

  it("withAddress supplies the missing address while the quote is open", () => {
    const q = requested({ address: null }).propose(proposeInput()).withAddress(ADDRESS).accept(NOW, "bk-1");
    expect(q.addressLine).toBe("Av. Julius Nyerere 1234");
  });
});

describe("closing", () => {
  it("decline works from REQUESTED and PROPOSED; reject only from PROPOSED; withdraw only from REQUESTED", () => {
    expect(requested().decline(NOW, "u", "other", "nota").status).toBe("DECLINED");
    expect(requested().propose(proposeInput()).decline(NOW, "u", "other", null).status).toBe("DECLINED");
    expect(() => requested().reject(NOW, "c", "too_expensive", null)).toThrow(QuoteTransitionError);
    expect(requested().propose(proposeInput()).reject(NOW, "c", "too_expensive", null).closedReason).toBe("too_expensive");
    expect(requested().withdraw(NOW, "c", null).closedReason).toBe("withdrawn");
    expect(() => requested().propose(proposeInput()).withdraw(NOW, "c", null)).toThrow(QuoteTransitionError);
  });

  it("a closing clears the clock and records who, when and why", () => {
    const q = requested().decline(NOW, "user-prov", "outside_area", "Só Maputo cidade");
    expect(q.expiresAt).toBeNull();
    expect(q.closedByUserId).toBe("user-prov");
    expect(q.closedNote).toBe("Só Maputo cidade");
    expect(q.declinedAt).toEqual(NOW);
  });
});

describe("clocks", () => {
  it("expire names the cause by the status and is a no-op elsewhere", () => {
    expect(requested().expire(NOW)).toMatchObject({ status: "EXPIRED", expiredCause: "provider_did_not_respond" });
    expect(requested().propose(proposeInput()).expire(NOW)).toMatchObject({ status: "EXPIRED", expiredCause: "proposal_lapsed" });
    const done = requested().decline(NOW, "u", "other", null);
    expect(done.expire(NOW)).toBe(done);
  });

  it("proposalStale returns to REQUESTED, supersedes the live proposal as slot_taken, and restarts the response clock", () => {
    const stale = requested().propose(proposeInput()).proposalStale(NOW, IN_48H);
    expect(stale.status).toBe("REQUESTED");
    expect(stale.liveProposal).toBeNull();
    expect(stale.proposals[0]?.supersededCause).toBe("slot_taken");
    expect(stale.expiresAt).toEqual(IN_48H);
  });
});
