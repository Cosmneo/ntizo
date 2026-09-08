import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PROVIDER_QUOTE_DETAIL_FIELDS, PROVIDER_QUOTE_FIELDS,
  declineQuote, proposeQuote, providerQuoteQueries,
} from "@/features/provider/quotes/data/quote.repository";

const fakes = vi.hoisted(() => ({ graphql: vi.fn() }));
vi.mock("@/shared/lib/graphql/session-graphql", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/lib/graphql/session-graphql")>()),
  sessionGraphql: fakes.graphql,
}));

beforeEach(() => fakes.graphql.mockReset());

describe("the selection sets", () => {
  it("asks the list for the customer's first name, the job's location and its shape", () => {
    for (const field of ["customerFirstName", "addressDistrict", "addressCity", "neededBy",
                         "descriptionSnippet", "attachmentCount", "expiresAt", "expiredCause",
                         "bookingId", "threadId", "timezone"]) {
      expect(PROVIDER_QUOTE_FIELDS).toContain(field);
    }
  });

  it("asks the detail for the workspace's own rate and the members who can perform it", () => {
    expect(PROVIDER_QUOTE_DETAIL_FIELDS).toContain("commissionBps");
    expect(PROVIDER_QUOTE_DETAIL_FIELDS).toContain("performers { id firstName }");
  });

  it("never asks for a customer surname, phone, email or street line — the read model has none " +
     "and a selection naming one is a query the server rejects", () => {
    for (const field of ["surname", "phone", "email", "addressLine"]) {
      expect(PROVIDER_QUOTE_DETAIL_FIELDS).not.toContain(field);
    }
  });
});

describe("the page query", () => {
  it("keys on the workspace, the tab and the offset", () => {
    expect(providerQuoteQueries.page({ providerId: "p1", tab: "toAnswer", offset: 0 }).queryKey)
      .toEqual(["provider", "p1", "quotes", "toAnswer", 0]);
    expect(providerQuoteQueries.page({ providerId: "p1", tab: "history", offset: 20 }).queryKey)
      .toEqual(["provider", "p1", "quotes", "history", 20]);
  });

  it("is disabled without a workspace, so switching providers cannot serve a stale one's rows", () => {
    expect(providerQuoteQueries.page({ providerId: "", tab: "toAnswer", offset: 0 }).enabled).toBe(false);
  });

  it("sends the page size the domain declares", async () => {
    fakes.graphql.mockResolvedValue({
      quoteForProvider: { items: [], counts: { toAnswer: 0, waiting: 0, history: 0 }, hasMore: false },
    });
    await providerQuoteQueries.page({ providerId: "p1", tab: "toAnswer", offset: 40 }).queryFn!({} as never);
    expect(fakes.graphql).toHaveBeenCalledWith(expect.stringContaining("quoteForProvider"), {
      input: { providerId: "p1", tab: "toAnswer", limit: 20, offset: 40 },
    });
  });
});

describe("the detail query", () => {
  it("keys on the workspace and the quote", () => {
    expect(providerQuoteQueries.detail("p1", "q1").queryKey).toEqual(["provider", "p1", "quote", "q1"]);
  });

  it("is disabled without a workspace", () => {
    expect(providerQuoteQueries.detail("", "q1").enabled).toBe(false);
  });
});

describe("the counts query", () => {
  it("keys on the workspace alone — the badge is one number, not one per tab", () => {
    expect(providerQuoteQueries.counts("p1").queryKey).toEqual(["provider", "p1", "quote-counts"]);
  });

  it("is disabled without a workspace", () => {
    expect(providerQuoteQueries.counts("").enabled).toBe(false);
  });
});

describe("the writes", () => {
  it("resolves a lost compare-and-swap as validUntil: null rather than throwing", async () => {
    fakes.graphql.mockResolvedValue({ quotePropose: { quoteId: "q1", validUntil: null } });
    await expect(proposeQuote({
      quoteId: "q1", priceMinor: 980000, startsAt: "2026-09-20T08:30:00+02:00",
      durationMinutes: 240, providerMemberId: "m1",
    })).resolves.toEqual({ validUntil: null });
  });

  it("sends a proposal without the optional fields it was not given", async () => {
    fakes.graphql.mockResolvedValue({ quotePropose: { quoteId: "q1", validUntil: "2026-09-10T00:00:00.000Z" } });
    await proposeQuote({
      quoteId: "q1", priceMinor: 980000, startsAt: "2026-09-20T08:30:00+02:00",
      durationMinutes: 240, providerMemberId: "m1",
    });
    const [, variables] = fakes.graphql.mock.calls[0]!;
    expect(variables.input).not.toHaveProperty("note");
    expect(variables.input).not.toHaveProperty("attachments");
  });

  it("sends the optional fields it was given", async () => {
    fakes.graphql.mockResolvedValue({ quotePropose: { quoteId: "q1", validUntil: "2026-09-10T00:00:00.000Z" } });
    await proposeQuote({
      quoteId: "q1", priceMinor: 980000, startsAt: "2026-09-20T08:30:00+02:00",
      durationMinutes: 240, providerMemberId: "m1", note: "Inclui tubagem",
      attachments: [{ storageKey: "k1" }],
    });
    const [, variables] = fakes.graphql.mock.calls[0]!;
    expect(variables.input.note).toBe("Inclui tubagem");
    expect(variables.input.attachments).toEqual([{ storageKey: "k1" }]);
  });

  it("reports a lost race on decline as applied:false rather than throwing", async () => {
    fakes.graphql.mockResolvedValue({ quoteDecline: { quoteId: "q1", applied: false } });
    await expect(declineQuote({ quoteId: "q1", reason: "not_available" }))
      .resolves.toEqual({ applied: false });
  });

  it("sends a decline without the optional fields it was not given", async () => {
    fakes.graphql.mockResolvedValue({ quoteDecline: { quoteId: "q1", applied: true } });
    await declineQuote({ quoteId: "q1", reason: "outside_area" });
    const [, variables] = fakes.graphql.mock.calls[0]!;
    expect(variables.input).toEqual({ quoteId: "q1", reason: "outside_area" });
  });
});
