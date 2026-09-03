import type { AttachmentDescriptor } from "@/features/messaging/domain/types";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";

const OPEN_SUPPORT_REQUEST = `
  mutation CommunicationOpenSupportRequest($input: CommunicationOpenSupportRequestInput!) {
    communicationOpenSupportRequest(input: $input) { threadId }
  }`;

export interface OpenSupportRequestInput {
  audience: "customer" | "provider";
  /** Required by the server when `audience` is `provider`; it answers `SUPPORT_NOT_A_MEMBER` when it is missing or not yours. */
  providerId?: string;
  subject: string;
  body: string;
  bookingId?: string;
  attachments?: AttachmentDescriptor[];
}

/**
 * Opens a support request and hands back the thread it created.
 *
 * The optional fields are spread in only when present rather than passed as
 * `undefined`: this schema's inputs are non-null where they are declared, and
 * a key sent explicitly as `null` is a validation error rather than an
 * omission. Trimming happens here so what the 1..120 subject bound is
 * measured against is exactly what gets stored.
 *
 * Reading the requests back is `messagingQueries.mine("support")` — a
 * support request IS a thread, and a second list query over the same rows
 * would be a second answer to one question.
 */
export async function openSupportRequest(input: OpenSupportRequestInput): Promise<string> {
  const d = await sessionGraphql<{ communicationOpenSupportRequest: { threadId: string } }>(
    OPEN_SUPPORT_REQUEST,
    {
      input: {
        audience: input.audience,
        ...(input.providerId ? { providerId: input.providerId } : {}),
        subject: input.subject.trim(),
        body: input.body.trim(),
        ...(input.bookingId ? { bookingId: input.bookingId } : {}),
        ...(input.attachments && input.attachments.length > 0
          ? { attachments: input.attachments }
          : {}),
      },
    },
  );
  return d.communicationOpenSupportRequest.threadId;
}
