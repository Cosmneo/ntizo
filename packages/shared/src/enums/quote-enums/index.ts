import { z } from "zod";

/** The seven states of a quote. A set, not a sequence — see the spec's state machine. */
export const QUOTE_STATUSES = [
  "REQUESTED",
  "PROPOSED",
  "ACCEPTED",
  "DECLINED",
  "REJECTED",
  "WITHDRAWN",
  "EXPIRED",
] as const;
export const quoteStatusSchema = z.enum(QUOTE_STATUSES);
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

/** The two live states: a clock is running on each of them. */
export const QUOTE_OPEN_STATUSES = ["REQUESTED", "PROPOSED"] as const;

/** Why a provider closed a request. Tokens the other side renders in its own language. */
export const QUOTE_PROVIDER_DECLINE_REASONS = [
  "not_available",
  "cannot_perform",
  "outside_area",
  "other",
] as const;
export type QuoteProviderDeclineReason = (typeof QUOTE_PROVIDER_DECLINE_REASONS)[number];

/** Why a customer refused a proposal. */
export const QUOTE_CUSTOMER_REJECT_REASONS = [
  "too_expensive",
  "wrong_time",
  "found_elsewhere",
  "other",
] as const;
export type QuoteCustomerRejectReason = (typeof QUOTE_CUSTOMER_REJECT_REASONS)[number];

/** The one reason a withdrawal records. */
export const QUOTE_WITHDRAWN_REASON = "withdrawn" as const;

export const QUOTE_EXPIRED_CAUSES = ["provider_did_not_respond", "proposal_lapsed"] as const;
export type QuoteExpiredCause = (typeof QUOTE_EXPIRED_CAUSES)[number];

export const QUOTE_SUPERSEDED_CAUSES = ["revised", "slot_taken"] as const;
export type QuoteSupersededCause = (typeof QUOTE_SUPERSEDED_CAUSES)[number];

/** Which step of the quote a file was sent with. */
export const QUOTE_ATTACHMENT_STEPS = ["request", "proposal", "closing"] as const;
export type QuoteAttachmentStep = (typeof QUOTE_ATTACHMENT_STEPS)[number];

export const CUSTOMER_QUOTE_TABS = ["open", "history"] as const;
export type CustomerQuoteTab = (typeof CUSTOMER_QUOTE_TABS)[number];

export const PROVIDER_QUOTE_TABS = ["toAnswer", "waiting", "history"] as const;
export type ProviderQuoteTab = (typeof PROVIDER_QUOTE_TABS)[number];
