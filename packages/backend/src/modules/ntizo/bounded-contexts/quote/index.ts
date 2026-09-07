export * from "./bootstrap";
export { Quote } from "./domain/aggregates/quote.aggregate";
// The one exception this context's own boundary crossing needs re-exported:
// `bookingOpenerOver` (apps/backend/api/src/booking-opener.adapter.ts) has to
// catch it, and no `app/` tree — including the composition root's adapter —
// imports another module's internals directly.
export { QuoteSlotTakenError } from "./domain/exceptions";
export { RequestQuoteCommand } from "./app/use-cases/request-quote.command";
export type { RequestQuoteInput } from "./app/use-cases/request-quote.command";
export { ProposeQuoteCommand } from "./app/use-cases/propose-quote.command";
export type { ProposeQuoteInput } from "./app/use-cases/propose-quote.command";
export { DeclineQuoteCommand } from "./app/use-cases/decline-quote.command";
export type { DeclineQuoteInput } from "./app/use-cases/decline-quote.command";
export { RejectQuoteCommand } from "./app/use-cases/reject-quote.command";
export type { RejectQuoteInput } from "./app/use-cases/reject-quote.command";
export { WithdrawQuoteCommand } from "./app/use-cases/withdraw-quote.command";
export type { WithdrawQuoteInput } from "./app/use-cases/withdraw-quote.command";
export { AcceptQuoteCommand } from "./app/use-cases/accept-quote.command";
export type { AcceptQuoteInput } from "./app/use-cases/accept-quote.command";
export { MarkProposalStaleInternalCommand } from "./app/use-cases/mark-proposal-stale.internal.command";
export { SweepQuoteCommand } from "./app/use-cases/sweep-quote.command";
export { SweepDueQuotesInternalCommand } from "./app/use-cases/sweep-due-quotes.internal.command";
export type { SweepDueQuotesInternalInput } from "./app/use-cases/sweep-due-quotes.internal.command";
export type {
  AttachmentStoragePort,
  StoredAttachmentMetadata,
} from "./app/ports/outbound/attachment-storage.port";
export type {
  BookingOpenerPort,
  OpenBookingFromQuoteInput,
} from "./app/ports/outbound/booking-opener.port";
export type { CustomerPhoneReaderPort } from "./app/ports/outbound/customer-phone.reader.port";
export type { PlatformSettingsReaderPort } from "./app/ports/outbound/platform-settings.reader.port";
export type { ProviderMemberReaderPort } from "./app/ports/outbound/provider-member.reader.port";
export type {
  NewQuoteAttachment,
  QuoteAttachmentRepositoryPort,
  QuoteAttachmentStep,
} from "./app/ports/outbound/quote-attachment.repository.port";
export type {
  QuoteServiceReaderPort,
  QuoteServiceSnapshot,
} from "./app/ports/outbound/quote-service.reader.port";
export type { QuoteRepositoryPort } from "./app/ports/outbound/quote.repository.port";
export type {
  RaiseNotificationInput,
  RaiseNotificationInternalPort,
} from "./app/ports/outbound/raise-notification.port";
export type { SlotOverlapReaderPort } from "./app/ports/outbound/slot-overlap.reader.port";
export type { StartThreadPort } from "./app/ports/outbound/start-thread.port";
// For the download route: reads a quote attachment row straight off the
// repository, the same way the communication context's own download route
// reaches for its message-attachment repository.
export { DrizzleQuoteAttachmentRepository } from "./infrastructure/repositories/drizzle/quote-attachment.repository";
