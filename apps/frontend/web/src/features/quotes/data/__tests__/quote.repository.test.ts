import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CUSTOMER_QUOTE_DETAIL_FIELDS, CUSTOMER_QUOTE_FIELDS, QUOTE_PROPOSAL_FIELDS,
  acceptQuote, myQuoteQueries, rejectQuote, requestQuote, withdrawQuote,
} from "@/features/quotes/data/quote.repository";

const fakes = vi.hoisted(() => ({ graphql: vi.fn() }));
vi.mock("@/shared/lib/graphql/session-graphql", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/lib/graphql/session-graphql")>()),
  sessionGraphql: fakes.graphql,
}));

beforeEach(() => fakes.graphql.mockReset());

describe("the selection sets", () => {
  it("asks for every proposal field the detail page renders", () => {
    for (const field of ["priceMinor", "currency", "startsAt", "endsAt", "durationMinutes",
                         "memberFirstName", "note", "validUntil", "supersededAt", "supersededCause"]) {
      expect(QUOTE_PROPOSAL_FIELDS).toContain(field);
    }
  });

  it("asks the list for the provider, the clock and the booking it became", () => {
    for (const field of ["providerName", "providerSlug", "providerVerified",
                         "expiresAt", "expiredCause", "bookingId", "threadId", "timezone"]) {
      expect(CUSTOMER_QUOTE_FIELDS).toContain(field);
    }
  });

  it("asks the detail for the request, its history and the closing words", () => {
    for (const field of ["description", "neededBy", "requestAttachments", "proposals",
                         "closedReason", "closedNote", "closingAttachments"]) {
      expect(CUSTOMER_QUOTE_DETAIL_FIELDS).toContain(field);
    }
  });

  it("never asks for a customer phone or email, which the provider must not see either", () => {
    expect(CUSTOMER_QUOTE_DETAIL_FIELDS).not.toContain("phone");
    expect(CUSTOMER_QUOTE_DETAIL_FIELDS).not.toContain("email");
  });
});

describe("the page query", () => {
  it("keys on the tab and the offset, so two tabs do not share a cache entry", () => {
    expect(myQuoteQueries.page({ tab: "open", offset: 0 }).queryKey)
      .toEqual(["quotes", "mine", "open", 0]);
    expect(myQuoteQueries.page({ tab: "history", offset: 20 }).queryKey)
      .toEqual(["quotes", "mine", "history", 20]);
  });

  it("sends the page size the domain declares", async () => {
    fakes.graphql.mockResolvedValue({ quoteMine: { items: [], counts: { open: 0, history: 0 }, hasMore: false } });
    await myQuoteQueries.page({ tab: "open", offset: 40 }).queryFn!({} as never);
    expect(fakes.graphql).toHaveBeenCalledWith(expect.stringContaining("quoteMine"), {
      input: { tab: "open", limit: 20, offset: 40 },
    });
  });
});

describe("the writes", () => {
  it("sends a request without the optional fields it was not given", async () => {
    fakes.graphql.mockResolvedValue({ quoteRequest: { quoteId: "q1", respondBy: "2026-09-05T10:12:00.000Z" } });
    await requestQuote({ serviceId: "s1", description: "Dois aparelhos", locale: "pt-MZ" });
    const [, variables] = fakes.graphql.mock.calls[0]!;
    expect(variables).toEqual({ input: { serviceId: "s1", description: "Dois aparelhos", locale: "pt-MZ" } });
    expect(variables.input).not.toHaveProperty("neededBy");
    expect(variables.input).not.toHaveProperty("address");
  });

  it("sends the optional fields it was given", async () => {
    fakes.graphql.mockResolvedValue({ quoteRequest: { quoteId: "q1", respondBy: "x" } });
    await requestQuote({
      serviceId: "s1", description: "d", locale: "pt-MZ", neededBy: "2026-09-27",
      address: { label: "Casa", line: "Av. 1234", city: "Maputo", district: null,
                 directions: null, lat: null, lng: null },
      attachments: [{ storageKey: "k1" }],
    });
    const [, variables] = fakes.graphql.mock.calls[0]!;
    expect(variables.input.neededBy).toBe("2026-09-27");
    expect(variables.input.attachments).toEqual([{ storageKey: "k1" }]);
    expect(variables.input.address.city).toBe("Maputo");
  });

  it("reports a lost race as applied:false rather than throwing", async () => {
    fakes.graphql.mockResolvedValue({ quoteReject: { quoteId: "q1", applied: false } });
    await expect(rejectQuote({ quoteId: "q1", reason: "too_expensive" }))
      .resolves.toEqual({ applied: false });
  });

  it("withdraws without a reason, because there is no reason token for withdrawal", async () => {
    fakes.graphql.mockResolvedValue({ quoteWithdraw: { quoteId: "q1", applied: true } });
    await withdrawQuote({ quoteId: "q1", note: "Já resolvi" });
    const [, variables] = fakes.graphql.mock.calls[0]!;
    expect(variables.input).toEqual({ quoteId: "q1", note: "Já resolvi" });
  });

  it("returns the booking the acceptance created and the deadline to pay it", async () => {
    fakes.graphql.mockResolvedValue({ quoteAccept: { bookingId: "b1", payBy: "2026-09-07T17:00:00.000Z" } });
    await expect(acceptQuote({ quoteId: "q1" }))
      .resolves.toEqual({ bookingId: "b1", payBy: "2026-09-07T17:00:00.000Z" });
  });
});
