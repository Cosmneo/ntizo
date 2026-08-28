import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { hasContact } from "@ntizo/shared/text";
import { ACCEPTED_ATTACHMENT_TYPES, type AcceptedAttachmentType } from "@ntizo/shared/attachments";
import { Message, MAX_ATTACHMENTS } from "../../domain/aggregates/message.aggregate";
import {
  AttachmentNotAvailableError,
  MessageContainsContactError,
  ThreadNotVisibleError,
  TooManyAttachmentsError,
} from "../../domain/exceptions";
import type { ThreadRepositoryPort } from "../ports/outbound/thread.repository.port";
import type { MessageRepositoryPort } from "../ports/outbound/message.repository.port";
import type { AttachmentRepositoryPort, NewAttachment } from "../ports/outbound/attachment.repository.port";
import type { AttachmentStoragePort } from "../ports/outbound/attachment-storage.port";

/** Narrows `stored.contentType` (a plain `string` — storage does not know about `AcceptedAttachmentType`) to the list `sniffContentType` is allowed to return. */
function isAcceptedAttachmentType(contentType: string): contentType is AcceptedAttachmentType {
  return (ACCEPTED_ATTACHMENT_TYPES as readonly string[]).includes(contentType);
}

/**
 * What an untrusted caller may say about one file it wants to attach: only
 * the key it was uploaded under. Nothing else — `contentType`, `sizeBytes`,
 * and `fileName` are all deliberately absent from this shape.
 *
 * `SendMessageCommand` never trusts any of those three off the wire. The
 * first two are the guarantee `sniffContentType` (Task 3) and the upload
 * route (Task 5) exist to provide: a client that uploaded a genuine JPEG and
 * then claimed a different type in `sendMessage` would undo it one hop
 * later. `fileName` used to ride along here too — the upload route already
 * runs `hasContact` on it and stamps the clean result onto the object as
 * `customMetadata.originalName`, but a client could still send back ANY
 * string under `fileName` in this separate call, one request later,
 * defeating that check entirely. All three are read back from storage
 * instead — see `resolveAttachments` — which is also where `NewAttachment`
 * (the trusted shape `AttachmentRepositoryPort.insertMany` accepts) gets
 * built.
 */
export interface AttachmentDescriptor {
  storageKey: string;
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
 *
 * `hasContact` runs on the trimmed body here too, before any of the above —
 * the gate the spec calls for and the only one of its two required call
 * sites (body, file name) that used to be missing. The composer already
 * runs the identical check as someone types, and the upload route already
 * runs it on a file's name; this is what makes the body check a GATE rather
 * than a hint a `curl` can skip.
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

    // The gate the spec's own reasoning for `packages/shared` exists to
    // make true: `hasContact` runs on the CLIENT (as someone types, for
    // feedback) and on the FILE NAME (the upload route, Task 5) — but until
    // this line, never on the body a `curl` can post straight past both.
    // Checked on the trimmed body, before `resolveAttachments` (which does
    // real I/O against storage) and before the transaction even opens — the
    // same cheap-check-first ordering `resolveAttachments` itself already
    // uses for `MAX_ATTACHMENTS`.
    const trimmedBody = input.body.trim();
    if (hasContact(trimmedBody)) throw new MessageContainsContactError();

    const descriptors = input.attachments ?? [];
    const attachments = await this.resolveAttachments(input.senderUserId, descriptors);

    const message = Message.compose({
      threadId: input.threadId,
      senderUserId: input.senderUserId,
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
      return { id };
    });
  }

  /**
   * Turns what the caller claimed into what `AttachmentRepositoryPort.insertMany`
   * is allowed to trust — that port's own doc comment says it does not
   * re-validate, so this is where that assumption is made true.
   *
   * Checks per descriptor, in this order because the cheaper ones come
   * first:
   *
   * 1. `storageKey` must start with `attachment/<senderUserId>/` — a plain
   *    string comparison, no I/O, and the fast way to refuse a key that was
   *    never this sender's to begin with.
   * 2. The object's own metadata, read from storage, must agree: it must
   *    exist at all, and its `customMetadata.uploadedByUserId` must name
   *    this same sender. This is an INDEPENDENT record of the same fact —
   *    not derived from the key's prefix — and fetching it is also how
   *    `contentType`, `sizeBytes` and `fileName` are learned, never from the
   *    descriptor (which no longer carries a `fileName` at all — see
   *    `AttachmentDescriptor`'s own doc comment for why). It is also the
   *    only check that proves the file exists, closing "a message pointing
   *    at a file that is not there".
   * 3. The stored `contentType` must be one `ACCEPTED_ATTACHMENT_TYPES`
   *    lists. Unreachable today — `sniffContentType` only ever stamps an
   *    accepted type or refuses the upload outright — but the point of
   *    exporting that list from `@ntizo/shared/attachments` was that it
   *    CONSTRAINS, not merely documents; this is the boundary that makes
   *    that true rather than aspirational.
   * 4. The stored `originalName` must not be null. Every object the real
   *    upload route writes carries one (`customMetadata.originalName`); its
   *    absence means this object did not come through that route, which is
   *    reason enough to refuse it the same way a missing object is refused.
   *
   * All four reasons — and a caller-forged key that never had the right
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
        if (!isAcceptedAttachmentType(stored.contentType)) {
          throw new AttachmentNotAvailableError();
        }
        if (stored.originalName === null) {
          throw new AttachmentNotAvailableError();
        }

        return {
          storageKey: descriptor.storageKey,
          fileName: stored.originalName,
          contentType: stored.contentType,
          sizeBytes: stored.sizeBytes,
        };
      }),
    );
  }
}
