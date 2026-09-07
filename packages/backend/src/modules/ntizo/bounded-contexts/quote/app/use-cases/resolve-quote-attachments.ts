import { ACCEPTED_ATTACHMENT_TYPES, MAX_ATTACHMENTS, type AcceptedAttachmentType } from "@ntizo/shared/attachments";
import { QuoteAttachmentNotAvailableError, QuoteTooManyAttachmentsError } from "../../domain/exceptions";
import type { AttachmentStoragePort } from "../ports/outbound/attachment-storage.port";

export interface AttachmentDescriptor {
  storageKey: string;
}

export interface ResolvedAttachment {
  storageKey: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

function isAcceptedAttachmentType(contentType: string): contentType is AcceptedAttachmentType {
  return (ACCEPTED_ATTACHMENT_TYPES as readonly string[]).includes(contentType);
}

/**
 * The same four checks messages make, against the same bucket and the same
 * key convention: the caller may only attach what they themselves uploaded,
 * the object must exist, its type must be one the server sniffed and accepted,
 * and it must carry the original name the download route serves it under.
 *
 * Every failure is the identical error, so a caller probing keys learns
 * nothing about which of the four it tripped.
 */
export async function resolveQuoteAttachments(
  storage: AttachmentStoragePort,
  uploaderUserId: string,
  descriptors: AttachmentDescriptor[],
): Promise<ResolvedAttachment[]> {
  if (descriptors.length > MAX_ATTACHMENTS) {
    throw new QuoteTooManyAttachmentsError(descriptors.length, MAX_ATTACHMENTS);
  }
  const ownPrefix = `attachment/${uploaderUserId}/`;
  return await Promise.all(
    descriptors.map(async (descriptor): Promise<ResolvedAttachment> => {
      if (!descriptor.storageKey.startsWith(ownPrefix)) throw new QuoteAttachmentNotAvailableError();
      const stored = await storage.head(descriptor.storageKey);
      if (!stored || stored.uploadedByUserId !== uploaderUserId) throw new QuoteAttachmentNotAvailableError();
      if (!isAcceptedAttachmentType(stored.contentType)) throw new QuoteAttachmentNotAvailableError();
      if (stored.originalName === null) throw new QuoteAttachmentNotAvailableError();
      return {
        storageKey: descriptor.storageKey,
        fileName: stored.originalName,
        contentType: stored.contentType,
        sizeBytes: stored.sizeBytes,
      };
    }),
  );
}
