import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { Message, MAX_ATTACHMENTS } from "../../domain/aggregates/message.aggregate";
import { AttachmentNotAvailableError, ThreadNotVisibleError, TooManyAttachmentsError } from "../../domain/exceptions";
import type { ThreadRepositoryPort } from "../ports/outbound/thread.repository.port";
import type { MessageRepositoryPort } from "../ports/outbound/message.repository.port";
import type { AttachmentRepositoryPort, NewAttachment } from "../ports/outbound/attachment.repository.port";
import type { AttachmentStoragePort } from "../ports/outbound/attachment-storage.port";

/**
 * What an untrusted caller may say about one file it wants to attach: the
 * key it was uploaded under, and a display name. Nothing else —
 * `contentType` and `sizeBytes` are deliberately absent from this shape.
 *
 * `SendMessageCommand` never trusts either of those two off the wire: a
 * client that uploaded a genuine JPEG and then claimed a different type in
 * `sendMessage` would undo the exact guarantee `sniffContentType` (Task 3)
 * and the upload route (Task 5) exist to provide. Both values are read back
 * from storage instead — see `resolveAttachments` — which is also where
 * `NewAttachment` (the trusted shape `AttachmentRepositoryPort.insertMany`
 * accepts) gets built.
 */
export interface AttachmentDescriptor {
  storageKey: string;
  fileName: string;
}

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
 * of its provider.
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
 */
export class SendMessageCommand {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly messages: MessageRepositoryPort,
    private readonly attachments: AttachmentRepositoryPort,
    private readonly attachmentStorage: AttachmentStoragePort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: SendMessageInput): Promise<{ id: string }> {
    const visible = await this.threads.findVisible(input.threadId, input.senderUserId);
    if (!visible) throw new ThreadNotVisibleError();

    const descriptors = input.attachments ?? [];
    const attachments = await this.resolveAttachments(input.senderUserId, descriptors);

    const message = Message.compose({
      threadId: input.threadId,
      senderUserId: input.senderUserId,
      body: input.body,
      attachmentCount: attachments.length,
      now: this.now(),
    });

    return await this.unitOfWork.atomicExecute(async () => {
      const id = await this.messages.insert(message);
      if (attachments.length > 0) {
        await this.attachments.insertMany(id, attachments);
      }
      await this.threads.touch(input.threadId, message.createdAt);
      return { id };
    });
  }

  /**
   * Turns what the caller claimed into what `AttachmentRepositoryPort.insertMany`
   * is allowed to trust — that port's own doc comment says it does not
   * re-validate, so this is where that assumption is made true.
   *
   * Two checks per descriptor, in this order because the first is free and
   * the second is not:
   *
   * 1. `storageKey` must start with `attachment/<senderUserId>/` — a plain
   *    string comparison, no I/O, and the fast way to refuse a key that was
   *    never this sender's to begin with.
   * 2. The object's own metadata, read from storage, must agree: it must
   *    exist at all, and its `customMetadata.uploadedByUserId` must name
   *    this same sender. This is an INDEPENDENT record of the same fact —
   *    not derived from the key's prefix — and fetching it is also how
   *    `contentType` and `sizeBytes` are learned, never from the
   *    descriptor. It is also the only check that proves the file exists,
   *    closing "a message pointing at a file that is not there".
   *
   * Both failure reasons — and a caller-forged key that never had the right
   * prefix — throw the identical `AttachmentNotAvailableError`; see that
   * class's own doc comment for why they must stay indistinguishable.
   *
   * Checked against `MAX_ATTACHMENTS` before any of the above: refusing a
   * six-attachment request outright is cheaper than resolving five of them
   * against storage only for `Message.compose` to refuse the count anyway.
   */
  private async resolveAttachments(
    senderUserId: string,
    descriptors: AttachmentDescriptor[],
  ): Promise<NewAttachment[]> {
    if (descriptors.length > MAX_ATTACHMENTS) {
      throw new TooManyAttachmentsError(descriptors.length, MAX_ATTACHMENTS);
    }

    const ownPrefix = `attachment/${senderUserId}/`;

    return await Promise.all(
      descriptors.map(async (descriptor): Promise<NewAttachment> => {
        if (!descriptor.storageKey.startsWith(ownPrefix)) {
          throw new AttachmentNotAvailableError();
        }

        const stored = await this.attachmentStorage.head(descriptor.storageKey);
        if (!stored || stored.uploadedByUserId !== senderUserId) {
          throw new AttachmentNotAvailableError();
        }

        return {
          storageKey: descriptor.storageKey,
          fileName: descriptor.fileName,
          contentType: stored.contentType,
          sizeBytes: stored.sizeBytes,
        };
      }),
    );
  }
}
