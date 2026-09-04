import type { CommunicationBootstrap } from "@ntizo/backend/modules/ntizo/bounded-contexts/communication";
import type { OpenDisputeThreadPort } from "@ntizo/backend/modules/ntizo/bounded-contexts/booking";

/**
 * The one place that knows a dispute is a support request.
 *
 * The booking context declares `OpenDisputeThreadPort` and the communication
 * context has `OpenSupportRequestCommand`; neither imports the other, because
 * no bounded context's `app/` tree imports another's. This function is the
 * seam between them, and it lives here — at the composition root — for the
 * same reason `raiseNotification` is wired here rather than imported inside
 * either context.
 *
 * Three of the values it supplies are decisions neither side should make on
 * its own:
 *
 * - `audience: "customer"` — only a booking's own customer may dispute it
 *   (`DisputeBookingCommand` refuses everybody else), so a dispute is never a
 *   provider's request. The provider answers on the thread; they do not open
 *   it.
 * - `kind: "dispute"` — the column Task 2 added, and the whole reason it
 *   exists: resolving a dispute moves a booking and resolving an ordinary
 *   support request must not. Nothing downstream infers this from the booking
 *   id being set, deliberately.
 * - `body` from `message` — the same text under the name each side uses for
 *   it.
 *
 * Only `storageKey` survives from each attachment, and that is not a loss:
 * `resolveAttachments` reads the file's real name, type and size back from
 * storage rather than believing any caller about them, so the other three
 * fields the wire carries were never going to be written anywhere. See
 * `DisputeAttachment`'s own doc comment for why they are carried this far.
 *
 * **Filling the port with the public command also inherits its refusals, and
 * that is worth knowing on both sides of this seam.**
 * `OpenSupportRequestCommand` refuses at `MAX_OPEN_SUPPORT_REQUESTS` (ten
 * open requests per requester) and refuses an empty body with no attachments.
 * Either one propagates out of `DisputeBookingCommand` unhandled: the booking
 * stays `MARKED_DONE` and its three-day clock keeps running toward
 * auto-completion. A customer sitting on ten open support requests therefore
 * cannot dispute at all until they close some.
 *
 * That is the right trade for now — refusing loudly beats opening a thread
 * the support cap does not count, and the alternative (a private entry point
 * that skips the cap) is a hole somebody would eventually walk a bot through.
 * But it is a cap in *another* context deciding whether a booking can be
 * contested, so if the dispute path ever needs its own allowance, this
 * function is where that exemption goes, not the booking context.
 */
export function disputeThreadOver(
  openSupportRequest: CommunicationBootstrap["useCases"]["openSupportRequest"],
): OpenDisputeThreadPort {
  return {
    async execute(input) {
      return await openSupportRequest.execute({
        requesterUserId: input.requesterUserId,
        audience: "customer",
        subject: input.subject,
        body: input.message,
        bookingId: input.bookingId,
        kind: "dispute",
        attachments: input.attachments.map(({ storageKey }) => ({ storageKey })),
      });
    },
  };
}
