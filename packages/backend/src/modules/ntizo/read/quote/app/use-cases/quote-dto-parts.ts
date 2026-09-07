import type { QuoteAttachmentDTO, QuoteProposalDTO } from "@ntizo/shared/read-models";
import type { QuoteAttachmentRow } from "../../../../shared/infrastructure/database/quote/schemas";
import type { QuoteProposalWithMember } from "../ports/outbound/quote-read.repository.port";

/**
 * The pieces both sides of a quote read identically — proposals, attachments,
 * and which proposal is the live one.
 *
 * Its own file for the reason `booking-timeline.ts` is: the customer's page
 * and the provider's page render the *same* proposals and the *same* files,
 * and two copies of that mapping is how the two sides of one quote start
 * disagreeing about what was offered. Only the address and the identity
 * differ between the audiences, and those two live in the mappers that are
 * allowed to know about them.
 *
 * Nothing here is audience-specific, which is deliberate: a helper in this
 * file that reached for `addressLine` or a phone number would be reachable
 * from `to-provider-quote-dto.ts`, and the reveal rule is enforced by that
 * mapper having no field to put such a thing in.
 */

/**
 * `quote_attachment.step` is `text`, kept honest by the
 * `quote_attachment_step_known` CHECK — which is what makes this cast safe:
 * a row reaching here already had its step validated by Postgres at write
 * time. The same reasoning `DrizzleBookingReadRepository.toRow` relies on for
 * `booking.status`.
 */
export function toAttachmentDTO(row: QuoteAttachmentRow): QuoteAttachmentDTO {
  return {
    id: row.id,
    step: row.step as QuoteAttachmentDTO["step"],
    proposalId: row.proposalId,
    fileName: row.fileName,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
  };
}

/**
 * One proposal, with the files that were sent with it.
 *
 * `supersededCause` is cast off `text` on the strength of
 * `quote_proposal_superseded_cause_known`, the same argument
 * `toAttachmentDTO` makes for `step`.
 */
export function toProposalDTO(
  row: QuoteProposalWithMember,
  attachments: readonly QuoteAttachmentRow[],
): QuoteProposalDTO {
  return {
    id: row.id,
    priceMinor: row.priceMinor,
    currency: row.currency,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    durationMinutes: row.durationMinutes,
    providerMemberId: row.providerMemberId,
    memberFirstName: row.memberFirstName,
    note: row.note,
    validUntil: row.validUntil.toISOString(),
    createdAt: row.createdAt.toISOString(),
    supersededAt: row.supersededAt ? row.supersededAt.toISOString() : null,
    supersededCause: row.supersededCause as QuoteProposalDTO["supersededCause"],
    attachments: attachments.filter((a) => a.proposalId === row.id).map(toAttachmentDTO),
  };
}

/**
 * The proposal that is still on the table, or null.
 *
 * By predicate, never by position: `Quote` guarantees at most one proposal
 * has `supersededAt === null` (see `Quote.liveProposal`, which reads exactly
 * this), and neither `accept` nor `reject` nor `withdraw` supersedes one — so
 * "the newest" and "the live one" are the same row on a live quote and stay
 * the same row after it closes, but only the null check says *why*.
 *
 * Null while `REQUESTED` (nothing has been offered yet) and after a closing
 * that had no proposal to close over.
 */
export function liveProposalOf(
  proposals: readonly QuoteProposalWithMember[],
  attachments: readonly QuoteAttachmentRow[],
): QuoteProposalDTO | null {
  const live = proposals.find((p) => p.supersededAt === null);
  return live ? toProposalDTO(live, attachments) : null;
}

/**
 * Every proposal the quote has ever carried, **newest first** — the order
 * `customerQuoteDetailReadModel.proposals` and
 * `providerQuoteDetailReadModel.proposals` both promise.
 *
 * The repository hands them over oldest first, which is the order
 * `QuoteReadRepositoryPort.proposalsFor` documents and the order `Quote`'s
 * own aggregate keeps. Reversing here rather than in the query is what keeps
 * those two promises from being made in two different places: the port says
 * what the rows are, the read model says what the screen sees, and this is
 * the one line between them.
 */
export function toProposalHistory(
  proposals: readonly QuoteProposalWithMember[],
  attachments: readonly QuoteAttachmentRow[],
): QuoteProposalDTO[] {
  return [...proposals].reverse().map((p) => toProposalDTO(p, attachments));
}

/** The files sent with the request itself. */
export function requestAttachmentsOf(
  attachments: readonly QuoteAttachmentRow[],
): QuoteAttachmentDTO[] {
  return attachments.filter((a) => a.step === "request").map(toAttachmentDTO);
}

/** The files a decline, a rejection or a withdrawal was closed with. */
export function closingAttachmentsOf(
  attachments: readonly QuoteAttachmentRow[],
): QuoteAttachmentDTO[] {
  return attachments.filter((a) => a.step === "closing").map(toAttachmentDTO);
}
