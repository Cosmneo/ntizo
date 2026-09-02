import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { NotificationType } from "@ntizo/shared";
import type { SupportAudience } from "../../../../shared/infrastructure/database/communication/enums";
import { Message } from "../../domain/aggregates/message.aggregate";
import { MAX_OPEN_SUPPORT_REQUESTS, SupportRequest } from "../../domain/aggregates/support-request.aggregate";
import {
  SupportBookingNotYoursError,
  SupportNotAMemberError,
  SupportTooManyOpenError,
} from "../../domain/exceptions";
import type { ThreadRepositoryPort } from "../ports/outbound/thread.repository.port";
import type { SupportRequestRepositoryPort } from "../ports/outbound/support-request.repository.port";
import type { MessageRepositoryPort } from "../ports/outbound/message.repository.port";
import type { AttachmentRepositoryPort } from "../ports/outbound/attachment.repository.port";
import type { AttachmentStoragePort } from "../ports/outbound/attachment-storage.port";
import type { ProviderReaderPort } from "../ports/outbound/provider-reader.port";
import type { BookingReaderPort } from "../ports/outbound/booking-reader.port";
import type { AdminUserReaderPort } from "../ports/outbound/admin-user-reader.port";
import type { RaiseNotificationInternalPort } from "../ports/outbound/raise-notification.port";
import { resolveAttachments, type AttachmentDescriptor } from "./resolve-attachments";

export interface OpenSupportRequestInput {
  requesterUserId: string;
  audience: SupportAudience;
  /** Required when `audience` is `provider`; ignored otherwise. */
  providerId?: string | null | undefined;
  subject: string;
  body: string;
  bookingId?: string | null | undefined;
  attachments?: AttachmentDescriptor[] | undefined;
}

/**
 * Opening a support request: a thread, its request row, and the first
 * message, in one transaction — then every admin is told.
 *
 * Checks run cheapest-first and all before the transaction opens: the
 * subject (pure), membership (one row), the booking (one row), the cap (one
 * count), then attachments (storage I/O). Nothing is written until all of
 * them pass, so a refusal never leaves a thread with no request behind it.
 *
 * **Telling the admins cannot undo the request.** The notification fan-out
 * runs after the transaction committed, one raise per admin, each in its
 * own try — the request exists whether or not anybody could be told, and
 * the admin queue shows it regardless. Same posture as
 * `NotifyUnreadInternalCommand`: a failed raise is logged and counted,
 * never rethrown.
 */
export class OpenSupportRequestCommand {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly supportRequests: SupportRequestRepositoryPort,
    private readonly messages: MessageRepositoryPort,
    private readonly attachments: AttachmentRepositoryPort,
    private readonly attachmentStorage: AttachmentStoragePort,
    private readonly providers: ProviderReaderPort,
    private readonly bookings: BookingReaderPort,
    private readonly admins: AdminUserReaderPort,
    private readonly raiseNotification: RaiseNotificationInternalPort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: OpenSupportRequestInput): Promise<{ threadId: string }> {
    const subject = SupportRequest.normaliseSubject(input.subject);

    let providerId: string | null = null;
    if (input.audience === "provider") {
      if (!input.providerId) throw new SupportNotAMemberError();
      if (!(await this.providers.isMember(input.providerId, input.requesterUserId))) {
        throw new SupportNotAMemberError();
      }
      providerId = input.providerId;
    }

    const bookingId = input.bookingId ?? null;
    if (bookingId !== null) {
      const owned = await this.bookings.isOwnedBy(bookingId, { userId: input.requesterUserId, providerId });
      if (!owned) throw new SupportBookingNotYoursError();
    }

    const open = await this.supportRequests.countOpenForRequester(input.requesterUserId, providerId);
    if (open >= MAX_OPEN_SUPPORT_REQUESTS) throw new SupportTooManyOpenError(MAX_OPEN_SUPPORT_REQUESTS);

    const attachments = await resolveAttachments(this.attachmentStorage, input.requesterUserId, input.attachments ?? []);
    const now = this.now();

    const threadId = await this.unitOfWork.atomicExecute(async () => {
      const id = await this.threads.openSupport(input.requesterUserId, providerId, now);
      await this.supportRequests.insert(
        SupportRequest.open({ threadId: id, audience: input.audience, subject, bookingId, now }),
      );
      const message = Message.compose({
        threadId: id,
        senderUserId: input.requesterUserId,
        senderSide: input.audience,
        body: input.body,
        attachmentCount: attachments.length,
        now,
      });
      const messageId = await this.messages.insert(message);
      if (attachments.length > 0) await this.attachments.insertMany(messageId, attachments);
      // No `touch`: `openSupport` set `last_message_at = now`, the same instant as this message.
      return id;
    });

    await this.tellAdmins(threadId, subject, input.audience, providerId);
    return { threadId };
  }

  private async tellAdmins(threadId: string, subject: string, audience: SupportAudience, providerId: string | null) {
    let adminIds: string[] = [];
    try {
      adminIds = await this.admins.findAdminUserIds();
    } catch (error) {
      console.error("[communication] could not list admins for a new support request", { threadId, error: String(error) });
      return;
    }
    for (const userId of adminIds) {
      try {
        await this.raiseNotification.execute({
          type: NotificationType.SupportRequestOpened,
          audience: "user",
          userId,
          payload: { threadId, subject, requestAudience: audience, ...(providerId ? { providerId } : {}) },
        });
      } catch (error) {
        // console.error, not the logger — same reason notify-unread gives.
        console.error("[communication] could not tell an admin about a new support request", {
          threadId,
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}
