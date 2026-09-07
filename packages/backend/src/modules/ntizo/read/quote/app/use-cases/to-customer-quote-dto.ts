import type {
  CustomerQuoteDTO,
  CustomerQuoteDetailDTO,
  QuoteAddressDTO,
} from "@ntizo/shared/read-models";
import type { QuoteAttachmentRow } from "../../../../shared/infrastructure/database/quote/schemas";
import type {
  QuoteListRow,
  QuoteProposalWithMember,
} from "../ports/outbound/quote-read.repository.port";
import {
  closingAttachmentsOf,
  liveProposalOf,
  requestAttachmentsOf,
  toProposalHistory,
} from "./quote-dto-parts";

/**
 * The customer's own quote, in full — this is *their* request, so there is
 * nothing here to withhold from them. The withholding is all on the other
 * side; see `to-provider-quote-dto.ts`.
 *
 * `status` and `expiredCause` are cast off `text` on the strength of the
 * `quote_status_known` and `quote_expired_cause_known` CHECK constraints: a
 * row reaching this mapper had both validated by Postgres at write time. The
 * same argument `DrizzleBookingReadRepository.toRow` makes for
 * `booking.status`.
 */
export function toCustomerQuoteDTO(
  row: QuoteListRow,
  proposals: readonly QuoteProposalWithMember[],
  attachments: readonly QuoteAttachmentRow[],
): CustomerQuoteDTO {
  return {
    id: row.id,
    status: row.status as CustomerQuoteDTO["status"],
    serviceId: row.serviceId,
    serviceName: row.serviceName,
    providerId: row.providerId,
    timezone: row.timezone,
    threadId: row.threadId,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    expiredCause: row.expiredCause as CustomerQuoteDTO["expiredCause"],
    closedReason: row.closedReason,
    bookingId: row.bookingId,
    requestedAt: row.requestedAt.toISOString(),
    proposal: liveProposalOf(proposals, attachments),
    providerName: row.providerName,
    providerSlug: row.providerSlug,
    providerVerified: row.providerVerified,
  };
}

/**
 * The address as `quoteAddressReadModel` describes it, or null.
 *
 * All three of `label`, `line` and `city` or none: the write side takes them
 * as one `addressInput` and `RequestQuoteCommand` stores them together, so a
 * quote either carries an address or carries no address at all. Filling a
 * missing one in with `""` would render as a blank line on a page that thinks
 * it has a street to show — null is what "this quote has no address" already
 * means, and it is what a partial row becomes here rather than at every
 * reader that prints one.
 */
function addressOf(row: QuoteListRow): QuoteAddressDTO | null {
  if (row.addressLabel === null || row.addressLine === null || row.addressCity === null) {
    return null;
  }
  return {
    label: row.addressLabel,
    line: row.addressLine,
    city: row.addressCity,
    district: row.addressDistrict,
    directions: row.addressDirections,
  };
}

/** The customer's detail page: their own words, their own address, and every proposal they were ever offered. */
export function toCustomerQuoteDetailDTO(
  row: QuoteListRow,
  proposals: readonly QuoteProposalWithMember[],
  attachments: readonly QuoteAttachmentRow[],
): CustomerQuoteDetailDTO {
  return {
    ...toCustomerQuoteDTO(row, proposals, attachments),
    description: row.description,
    neededBy: row.neededBy,
    address: addressOf(row),
    requestAttachments: requestAttachmentsOf(attachments),
    proposals: toProposalHistory(proposals, attachments),
    closedNote: row.closedNote,
    closingAttachments: closingAttachmentsOf(attachments),
  };
}
