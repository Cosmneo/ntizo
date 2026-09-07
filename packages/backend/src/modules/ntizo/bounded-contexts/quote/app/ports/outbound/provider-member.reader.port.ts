/**
 * Whether a person belongs to a provider, as this context needs it to
 * authorize a provider member proposing on or declining a quote — the two
 * transitions a provider side makes. (The customer's own transitions,
 * accepting, rejecting and withdrawing, are authorized against the quote's
 * `customerId` directly and need no reader of their own.)
 *
 * An outbound port rather than an import of the Provider context: no `app/`
 * tree imports another context's `app/` tree, the same reasoning Booking's
 * own `ProviderMemberReaderPort` gives for the identical shape. It answers
 * one question and no more — whether the caller may act on this quote's
 * provider at all, not what role they hold there — because any member, not
 * only its owner or admin, may respond to a quote.
 */
export interface ProviderMemberReaderPort {
  /** Whether `userId` belongs to `providerId`, in any role. */
  isMember(providerId: string, userId: string): Promise<boolean>;
}
