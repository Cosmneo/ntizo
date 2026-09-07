import type { ProviderQuoteDTO, ProviderQuoteDetailDTO } from "@ntizo/shared/read-models";
import type { QuoteAttachmentRow } from "../../../../shared/infrastructure/database/quote/schemas";
import type {
  QuoteListRow,
  QuoteProposalWithMember,
  QuoteProviderFormFacts,
} from "../ports/outbound/quote-read.repository.port";
import {
  closingAttachmentsOf,
  liveProposalOf,
  requestAttachmentsOf,
  toProposalHistory,
} from "./quote-dto-parts";

/**
 * **The reveal rule, enforced by shape.**
 *
 * A workspace pricing a job is told the district and the city, and nothing
 * further about where the customer lives or how to reach them outside the
 * platform. That is not a screen's decision and there is no flag here to get
 * wrong: `providerQuoteReadModel` simply has no field for the rest, so this
 * mapper has nowhere to put it, and a page cannot leak what it was never
 * sent. `QuoteListRow` carries the full address because the *customer's* own
 * detail page renders it — see that interface's own note on why one row shape
 * serves two audiences.
 *
 * The reason is the commission model. The platform's cut comes out of the
 * provider's payout (see `provider.commission_bps`), so a provider holding a
 * way to contact the customer directly, before any money has moved, has every
 * incentive to take the deal off the platform. The booking side draws the
 * same line and draws it later — `REVEALED_STATUSES` in
 * `to-provider-booking-dto.ts` opens up once a booking is `CONFIRMED`, which
 * is to say once it is paid. A quote never reaches paid: accepting one
 * *creates* the booking, and the booking's own mapper takes over from there.
 * So there is no status at which this mapper reveals anything, which is why
 * it takes no status flag and has no branch.
 *
 * Whoever adds a field here: adding one to `providerQuoteReadModel` is the
 * only way to widen what a workspace sees, and that is the change to argue
 * about in review. This file is deliberately not where that argument can be
 * had quietly.
 */

/**
 * What a customer with no first name on their profile is called. Not
 * translated: the read model promises a non-empty string, and the launch
 * market reads Portuguese. The same constant, the same value and the same
 * reasoning as `to-provider-booking-dto.ts`'s — one word for a nameless
 * customer across both of a workspace's queues.
 *
 * **A constant rather than a fallback, and that is the whole point.** The
 * obvious thing to reach for when a profile has no name is the local part of
 * the address the person registered with, and this codebase does exactly that
 * for the workspace's own staff (`displayFirstName` in the read repository).
 * Applied to the customer it would hand a workspace "joao.silva" off somebody
 * who simply never filled their name in — a real name, and a strong lead
 * toward contacting them directly. That is the incentive the reveal rule
 * exists to remove: the commission comes out of the provider's payout, so
 * anything that lets them reach the customer before money has moved is worth
 * more to them off the platform than on it. Withholding the street line while
 * printing the address's own local part would give the rule away for nothing.
 *
 * `QuoteListRow.customerFirstName` is therefore `string | null`, and
 * `quoteSelect` does not read the customer's registered address at all — so
 * there is nothing in scope here to fall back to even by mistake.
 */
const NAMELESS_CUSTOMER = "Cliente";

/** What the list card shows of a request the provider has not opened yet. */
const SNIPPET_LENGTH = 160;

/**
 * The description, cut to what a card can hold.
 *
 * A hard 160-character slice rather than a word-boundary one: the ellipsis is
 * the reader's job, the read model promises a plain `string`, and a truncation
 * that moved with the wording would give the same request two different cards
 * in two different lists.
 */
export function descriptionSnippetOf(description: string): string {
  return description.length <= SNIPPET_LENGTH ? description : description.slice(0, SNIPPET_LENGTH);
}

export function toProviderQuoteDTO(
  row: QuoteListRow,
  proposals: readonly QuoteProposalWithMember[],
  attachments: readonly QuoteAttachmentRow[],
): ProviderQuoteDTO {
  return {
    id: row.id,
    status: row.status as ProviderQuoteDTO["status"],
    serviceId: row.serviceId,
    serviceName: row.serviceName,
    providerId: row.providerId,
    timezone: row.timezone,
    threadId: row.threadId,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    expiredCause: row.expiredCause as ProviderQuoteDTO["expiredCause"],
    closedReason: row.closedReason,
    bookingId: row.bookingId,
    requestedAt: row.requestedAt.toISOString(),
    proposal: liveProposalOf(proposals, attachments),
    customerFirstName: row.customerFirstName ?? NAMELESS_CUSTOMER,
    // The two the reveal rule allows: enough to price travel, not enough to
    // turn up at a door. Everything else of the address stops at the
    // repository — see this file's own doc comment.
    addressDistrict: row.addressDistrict,
    addressCity: row.addressCity,
    neededBy: row.neededBy,
    descriptionSnippet: descriptionSnippetOf(row.description),
    attachmentCount: row.attachmentCount,
  };
}

/**
 * The workspace's detail page: the request in full words, the files, every
 * proposal, and the two facts the proposal form needs — this workspace's own
 * rate and the members who perform this service.
 *
 * `customerCompletedBookings` is the one thing here that is about the person
 * rather than the job, and it is a count: "this customer has finished eleven
 * bookings on the platform" is a reason to answer quickly and names nobody.
 */
export function toProviderQuoteDetailDTO(
  row: QuoteListRow,
  proposals: readonly QuoteProposalWithMember[],
  attachments: readonly QuoteAttachmentRow[],
  facts: QuoteProviderFormFacts,
  customerCompletedBookings: number,
): ProviderQuoteDetailDTO {
  return {
    ...toProviderQuoteDTO(row, proposals, attachments),
    description: row.description,
    customerCompletedBookings,
    requestAttachments: requestAttachmentsOf(attachments),
    proposals: toProposalHistory(proposals, attachments),
    closedNote: row.closedNote,
    closingAttachments: closingAttachmentsOf(attachments),
    commissionBps: facts.commissionBps,
    performers: facts.performers,
  };
}
