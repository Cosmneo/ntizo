import { ACCEPTED_ATTACHMENT_TYPES, type AcceptedAttachmentType } from "@ntizo/shared/attachments";
import { MAX_ATTACHMENTS } from "../../domain/aggregates/message.aggregate";
import { AttachmentNotAvailableError, TooManyAttachmentsError } from "../../domain/exceptions";
import type { NewAttachment } from "../ports/outbound/attachment.repository.port";
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
 * Neither `SendMessageCommand` nor `OpenSupportRequestCommand` nor
 * `ReplyToSupportRequestCommand` ever trusts any of those three off the
 * wire. The first two are the guarantee `sniffContentType` (Task 3) and the
 * upload route (Task 5) exist to provide: a client that uploaded a genuine
 * JPEG and then claimed a different type in `sendMessage` would undo it one
 * hop later. `fileName` used to ride along here too — the upload route
 * already runs `hasContact` on it and stamps the clean result onto the
 * object as `customMetadata.originalName`, but a client could still send
 * back ANY string under `fileName` in this separate call, one request
 * later, defeating that check entirely. All three are read back from
 * storage instead — see `resolveAttachments` — which is also where
 * `NewAttachment` (the trusted shape `AttachmentRepositoryPort.insertMany`
 * accepts) gets built.
 */
export interface AttachmentDescriptor {
  storageKey: string;
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
 *
 * Lifted out of `SendMessageCommand` unchanged so that
 * `OpenSupportRequestCommand` and `ReplyToSupportRequestCommand` run the
 * identical four checks — see `SendMessageCommand`'s history for the
 * reasoning behind each, which applies to all three callers.
 */
export async function resolveAttachments(
  storage: AttachmentStoragePort,
  senderUserId: string,
  descriptors: AttachmentDescriptor[],
): Promise<NewAttachment[]> {
  if (descriptors.length > MAX_ATTACHMENTS) {
    throw new TooManyAttachmentsError(descriptors.length, MAX_ATTACHMENTS);
  }
  const ownPrefix = `attachment/${senderUserId}/`;
  return await Promise.all(
    descriptors.map(async (descriptor): Promise<NewAttachment> => {
      if (!descriptor.storageKey.startsWith(ownPrefix)) throw new AttachmentNotAvailableError();
      const stored = await storage.head(descriptor.storageKey);
      if (!stored || stored.uploadedByUserId !== senderUserId) throw new AttachmentNotAvailableError();
      if (!isAcceptedAttachmentType(stored.contentType)) throw new AttachmentNotAvailableError();
      if (stored.originalName === null) throw new AttachmentNotAvailableError();
      return {
        storageKey: descriptor.storageKey,
        fileName: stored.originalName,
        contentType: stored.contentType,
        sizeBytes: stored.sizeBytes,
      };
    }),
  );
}
