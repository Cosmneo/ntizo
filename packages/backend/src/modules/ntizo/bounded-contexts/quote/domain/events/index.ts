import { BaseDomainEvent } from "@cosmneo/onion-lasagna";

type Party = { quoteId: string; customerId: string; providerId: string; serviceId: string };

export class QuoteRequested extends BaseDomainEvent<Party & { respondBy: Date }> {
  constructor(payload: Party & { respondBy: Date }) {
    super("quote.requested", payload.quoteId, payload);
  }
}

export class QuoteProposed extends BaseDomainEvent<
  Party & { proposalId: string; priceMinor: number; currency: string; startsAt: Date; validUntil: Date; revision: boolean }
> {
  constructor(payload: Party & { proposalId: string; priceMinor: number; currency: string; startsAt: Date; validUntil: Date; revision: boolean }) {
    super("quote.proposed", payload.quoteId, payload);
  }
}

export class QuoteAccepted extends BaseDomainEvent<Party & { bookingId: string; priceMinor: number; currency: string }> {
  constructor(payload: Party & { bookingId: string; priceMinor: number; currency: string }) {
    super("quote.accepted", payload.quoteId, payload);
  }
}

export class QuoteDeclined extends BaseDomainEvent<Party & { reason: string }> {
  constructor(payload: Party & { reason: string }) {
    super("quote.declined", payload.quoteId, payload);
  }
}

export class QuoteRejected extends BaseDomainEvent<Party & { reason: string }> {
  constructor(payload: Party & { reason: string }) {
    super("quote.rejected", payload.quoteId, payload);
  }
}

export class QuoteWithdrawn extends BaseDomainEvent<Party> {
  constructor(payload: Party) {
    super("quote.withdrawn", payload.quoteId, payload);
  }
}

export type QuoteExpiredCause = "provider_did_not_respond" | "proposal_lapsed";

export class QuoteExpired extends BaseDomainEvent<Party & { cause: QuoteExpiredCause }> {
  constructor(payload: Party & { cause: QuoteExpiredCause }) {
    super("quote.expired", payload.quoteId, payload);
  }
}

export class QuoteProposalStale extends BaseDomainEvent<Party & { proposalId: string; cause: "slot_taken"; respondBy: Date }> {
  constructor(payload: Party & { proposalId: string; cause: "slot_taken"; respondBy: Date }) {
    super("quote.proposal_stale", payload.quoteId, payload);
  }
}
