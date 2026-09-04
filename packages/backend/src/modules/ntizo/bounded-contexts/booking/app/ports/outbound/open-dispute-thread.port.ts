/**
 * One file a customer wants the administrator to look at.
 *
 * Declared with all four fields because that is what the wire carries — the
 * upload route answers with exactly this shape and the client hands it back
 * unchanged (see Task 8's `disputeBooking` input). Only `storageKey` is
 * *trusted* on the other side: the communication context reads the file's
 * real name, type and size back from storage rather than believing a caller
 * about any of them (see `resolveAttachments`), so the other three travel as
 * what the client claimed and are not what any row is written from. Carried
 * anyway rather than stripped here, because stripping them would make this
 * port's shape disagree with the mutation that feeds it, and the next reader
 * would have to find that out by following the data. If that mutation's input
 * is ever narrowed to `storageKey` alone, this interface should follow it
 * down rather than keep three fields for a shape nothing sends any more.
 */
export interface DisputeAttachment {
  storageKey: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

/**
 * Opening the conversation a dispute lives in. The communication context's
 * `OpenSupportRequestCommand` is what fills this at the composition root; it
 * is declared again here rather than imported, for the reason
 * `raise-notification.port.ts` gives: no bounded context's `app/` tree
 * imports another's.
 *
 * Not structurally identical to that command's own input, and deliberately
 * so. Three of its fields are decisions this side has no business making —
 * `audience` is always `customer` (only a booking's own customer may dispute
 * it), and `kind` is always `dispute`, which is the whole reason Task 2 added
 * that column — and one is named differently: `message` here, `body` there.
 * The mapping between the two lives at the composition root, which is the one
 * place allowed to know both contexts exist.
 *
 * **This call is allowed to refuse for reasons this context cannot see**, and
 * `DisputeBookingCommand` lets those refusals out rather than swallowing
 * them: the implementation behind it caps how many conversations one person
 * may have open at once, and rejects a subject longer than the column it
 * writes to. Both are the other context's rules to keep. See
 * `dispute-thread.adapter.ts`, which is where a dispute-specific allowance
 * would go if one is ever wanted.
 */
export interface OpenDisputeThreadInput {
  bookingId: string;
  requesterUserId: string;
  subject: string;
  message: string;
  attachments: readonly DisputeAttachment[];
}

export interface OpenDisputeThreadPort {
  execute(input: OpenDisputeThreadInput): Promise<{ threadId: string }>;
}
