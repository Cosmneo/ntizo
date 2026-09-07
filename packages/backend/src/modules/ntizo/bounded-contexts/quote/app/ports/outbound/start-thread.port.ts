/**
 * Opening the conversation a quote's messages and attachments live in. The
 * Communication context's own thread-start command is what fills this at the
 * composition root; it is declared again here rather than imported, for the
 * reason `raise-notification.port.ts` gives: no bounded context's `app/`
 * tree imports another's.
 *
 * A request starts its own thread before the `Quote` aggregate exists —
 * `RequestQuoteCommand` calls this first and hands the resulting `threadId`
 * to `Quote.request` — so this asks only for the two parties involved, not
 * for any quote field. `kind`, `subject` and everything else a thread might
 * carry are decisions the composition root's adapter makes on this context's
 * behalf, the same split `OpenDisputeThreadPort` draws for Booking.
 */
export interface StartThreadPort {
  execute(input: { customerUserId: string; providerId: string }): Promise<{ threadId: string }>;
}
