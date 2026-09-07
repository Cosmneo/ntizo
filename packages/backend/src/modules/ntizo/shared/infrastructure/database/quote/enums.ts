/** A set, not a sequence — the transitions are the aggregate's business. */
export const QuoteStatus = {
  Requested: "REQUESTED",
  Proposed: "PROPOSED",
  Accepted: "ACCEPTED",
  Declined: "DECLINED",
  Rejected: "REJECTED",
  Withdrawn: "WITHDRAWN",
  Expired: "EXPIRED",
} as const;

export type QuoteStatus = (typeof QuoteStatus)[keyof typeof QuoteStatus];
export const QUOTE_STATUS_VALUES = Object.values(QuoteStatus);

/**
 * The statuses on which `expires_at` is a deadline somebody is waiting on:
 * the provider's response window on REQUESTED, the proposal's validity on
 * PROPOSED. Adding one here is two edits — this constant and an arm in
 * `SweepQuoteCommand` — or the row is swept for ever and answered by nobody.
 */
export const QUOTE_DEADLINE_BEARING_STATUSES = [
  QuoteStatus.Requested,
  QuoteStatus.Proposed,
] as const;
