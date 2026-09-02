import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { hasContact } from "@ntizo/shared/text";
import type { SenderSide } from "../../../../shared/infrastructure/database/communication/enums";
import { Message } from "../../domain/aggregates/message.aggregate";
import { MessageContainsContactError, ThreadNotVisibleError } from "../../domain/exceptions";
import type { ThreadRepositoryPort } from "../ports/outbound/thread.repository.port";
import type { MessageRepositoryPort } from "../ports/outbound/message.repository.port";
import type { AttachmentRepositoryPort } from "../ports/outbound/attachment.repository.port";
import type { AttachmentStoragePort } from "../ports/outbound/attachment-storage.port";
import type { SupportRequestRepositoryPort } from "../ports/outbound/support-request.repository.port";
import { resolveAttachments, type AttachmentDescriptor } from "./resolve-attachments";

// Re-exported so `index.ts` and the write handlers keep importing
// `AttachmentDescriptor` from this file, exactly where they do today —
// `resolveAttachments` moved to its own module (see that file), but this
// type's public home did not.
export type { AttachmentDescriptor };

export interface SendMessageInput {
  threadId: string;
  senderUserId: string;
  body: string;
  /**
   * Already-uploaded files to attach, as the caller described them —
   * resolved against storage before anything is written. Optional and
   * defaults to none; `Message.compose` still throws `MessageEmptyError` for
   * an empty `body` when this is also empty.
   */
  attachments?: AttachmentDescriptor[];
}

/**
 * Sending into an existing conversation — the customer on it, or any member
 * of its provider, on an inquiry; the requester's side or an admin, on a
 * support request.
 *
 * Visibility is resolved once, by `findVisible`, and its answer IS the
 * authorization decision: the same predicate the customer's and the
 * provider's inbox both rely on to decide who may even open a thread, so a
 * caller who cannot see it cannot write into it either. `ThreadNotVisibleError`
 * is deliberately the same refusal `findVisible` returns for a thread that
 * plainly does not exist — see that port's doc comment for why the two must
 * stay indistinguishable to the caller: telling "not yours" apart from
 * "doesn't exist" tells an attacker probing thread ids which ones are real.
 *
 * The insert, the attachment writes, and the touch happen inside one
 * transaction, in that order: a message that exists but never moved its
 * thread's `last_message_at` would silently drop out of both inboxes'
 * newest-first ordering, and a message whose attachments landed outside the
 * transaction could exist with a promised attachment count that the
 * `attachment` table never backs. `atomicExecute` is what makes "all three
 * writes or none of them" true across a failure landing between any two of
 * them.
 *
 * Attachment descriptors are resolved against storage — see
 * `resolveAttachments` — before the transaction even opens: a forged or
 * stale descriptor is rejected before anything is written, not rolled back
 * after.
 *
 * `hasContact` runs on the trimmed body here too, before any of the above —
 * the gate the spec calls for and the only one of its two required call
 * sites (body, file name) that used to be missing. The composer already
 * runs the identical check as someone types, and the upload route already
 * runs it on a file's name; this is what makes the body check a GATE rather
 * than a hint a `curl` can skip. Since phase 2, this gate is skipped on a
 * support thread — see the comment at the check itself — and a requester
 * writing on a resolved request reopens it, inside the same transaction as
 * the message that means it.
 */
export class SendMessageCommand {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly messages: MessageRepositoryPort,
    private readonly attachments: AttachmentRepositoryPort,
    private readonly supportRequests: SupportRequestRepositoryPort,
    private readonly attachmentStorage: AttachmentStoragePort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: SendMessageInput): Promise<{ id: string }> {
    const visible = await this.threads.findVisible(input.threadId, input.senderUserId);
    if (!visible) throw new ThreadNotVisibleError();

    const isSupport = visible.type === "support";

    // The contact gate is an anti-disintermediation rule between a customer
    // and a provider. Between a person and the platform's own support it
    // would refuse exactly what support needs — a phone number to call back.
    const trimmedBody = input.body.trim();
    if (!isSupport && hasContact(trimmedBody)) throw new MessageContainsContactError();

    // The side is a fact about the thread and who is writing, decided here
    // and written on the row — never inferred later from a role. On a
    // support request the requester's side is the audience; on an inquiry
    // it is customer-or-not, and `findVisible` already proved a non-customer
    // is a member.
    const senderSide: SenderSide = isSupport
      ? visible.providerId === null
        ? "customer"
        : "provider"
      : visible.customerUserId === input.senderUserId
        ? "customer"
        : "provider";

    const descriptors = input.attachments ?? [];
    const attachments = await resolveAttachments(this.attachmentStorage, input.senderUserId, descriptors);

    const message = Message.compose({
      threadId: input.threadId,
      senderUserId: input.senderUserId,
      senderSide,
      body: trimmedBody,
      attachmentCount: attachments.length,
      now: this.now(),
    });

    return await this.unitOfWork.atomicExecute(async () => {
      const id = await this.messages.insert(message);
      if (attachments.length > 0) {
        await this.attachments.insertMany(id, attachments);
      }
      await this.threads.touch(input.threadId, message.createdAt);
      // A requester writing on a resolved request is the requester saying
      // "not solved" — the only reopen there is, in the same transaction as
      // the message that means it.
      if (isSupport) {
        const request = await this.supportRequests.findByThreadId(input.threadId);
        if (request && request.status === "resolved") {
          await this.supportRequests.save(request.reopen());
        }
      }
      return { id };
    });
  }
}
