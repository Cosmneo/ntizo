import { DrizzleThreadRepository } from "../infrastructure/repositories/drizzle/thread.repository";
import { DrizzleMessageRepository } from "../infrastructure/repositories/drizzle/message.repository";
import { DrizzleAttachmentRepository } from "../infrastructure/repositories/drizzle/attachment.repository";
import { DrizzleSupportRequestRepository } from "../infrastructure/repositories/drizzle/support-request.repository";
import { DrizzleProviderReader } from "../infrastructure/outbound-adapters/cross-bc/provider-reader.adapter";
import { DrizzleBookingReader } from "../infrastructure/outbound-adapters/cross-bc/booking-reader.adapter";
import { DrizzleAdminUserReader } from "../infrastructure/outbound-adapters/cross-bc/admin-user-reader.adapter";
import { StartThreadCommand } from "../app/use-cases/start-thread.command";
import { SendMessageCommand } from "../app/use-cases/send-message.command";
import { MarkThreadReadCommand } from "../app/use-cases/mark-thread-read.command";
import { OpenSupportRequestCommand } from "../app/use-cases/open-support-request.command";
import { ReplyToSupportRequestCommand } from "../app/use-cases/reply-to-support-request.command";
import { ResolveSupportRequestCommand } from "../app/use-cases/resolve-support-request.command";
import { MarkSupportRequestReadCommand } from "../app/use-cases/mark-support-request-read.command";
import { NotifyUnreadInternalCommand } from "../app/use-cases/notify-unread.internal.command";
import type { RaiseNotificationInternalPort } from "../app/ports/outbound/raise-notification.port";
import type { AttachmentStoragePort } from "../app/ports/outbound/attachment-storage.port";
import { DrizzleUnitOfWork } from "../../../../../shared/infrastructure/unit-of-work";

export interface CommunicationBootstrapDeps {
  /**
   * The notification context's real `RaiseNotificationInternalCommand`
   * (ideally already wrapped in `DeferredNotificationDelivery` so the sweep
   * sends both a bell entry and an email) — satisfies
   * `RaiseNotificationInternalPort` structurally, with no adapter class
   * needed. This bootstrap is the one place allowed to know that coupling
   * exists; see the port's own doc comment for why it is declared here
   * rather than imported from the notification context's `app/` tree.
   *
   * Two callers today: `apps/backend/api/src/scheduled.ts`'s cron sweep
   * (the only place `useCases.internal.notifyUnread` is used) and
   * `apps/backend/api/src/graphql/private.ts` (Task 8's write-tier
   * mutations — `startThread`/`send`/`markRead` — which never touch
   * `internal.notifyUnread` at all, only the same `raiseNotification`
   * dependency this bootstrap already required for the sweep).
   */
  raiseNotification: RaiseNotificationInternalPort;
  /**
   * Reads an R2 object's real content type, size, and uploader —
   * `apps/backend/api/src/attachment-storage.adapter.ts`'s
   * `AttachmentStorageAdapter`, unlike `raiseNotification` above, since
   * nothing elsewhere in this codebase is already shaped like this port:
   * `packages/backend` must build without the Workers type package, so the
   * real R2-backed implementation can only live in `apps/backend/api`,
   * where the `ATTACHMENTS_BUCKET` binding does. Wired only into
   * `sendMessage` — see `SendMessageCommand.resolveAttachments`.
   */
  attachmentStorage: AttachmentStoragePort;
}

export function bootstrapCommunication(deps: CommunicationBootstrapDeps) {
  const threadRepository = new DrizzleThreadRepository();
  const messageRepository = new DrizzleMessageRepository();
  const attachmentRepository = new DrizzleAttachmentRepository();
  const supportRequestRepository = new DrizzleSupportRequestRepository();
  const providerReader = new DrizzleProviderReader();
  const bookingReader = new DrizzleBookingReader();
  const adminUserReader = new DrizzleAdminUserReader();
  const unitOfWork = new DrizzleUnitOfWork();

  return {
    // `attachmentRepository` is exposed here, not only wired into
    // `sendMessage`, because Task 5's download route needs `findVisible`
    // directly — it is a permission check plus a row fetch, not a use case
    // — the same reason `admin-access.ts` and `api.ts` reach other
    // contexts' read repositories through `adapters` rather than a command.
    adapters: {
      threadRepository,
      messageRepository,
      attachmentRepository,
      supportRequestRepository,
      providerReader,
      bookingReader,
      adminUserReader,
      unitOfWork,
    },
    useCases: {
      startThread: new StartThreadCommand(threadRepository, providerReader),
      sendMessage: new SendMessageCommand(
        threadRepository,
        messageRepository,
        attachmentRepository,
        supportRequestRepository,
        deps.attachmentStorage,
        unitOfWork,
      ),
      markThreadRead: new MarkThreadReadCommand(threadRepository, messageRepository),
      // Phase 2 — the requester's side.
      openSupportRequest: new OpenSupportRequestCommand(
        threadRepository,
        supportRequestRepository,
        messageRepository,
        attachmentRepository,
        deps.attachmentStorage,
        providerReader,
        bookingReader,
        adminUserReader,
        deps.raiseNotification,
        unitOfWork,
      ),
      // Phase 2 — the platform's side. Mounted only by `write/support`,
      // behind `requireAdmin`; nothing on the participant slices reaches them.
      replyToSupportRequest: new ReplyToSupportRequestCommand(
        threadRepository,
        messageRepository,
        attachmentRepository,
        deps.attachmentStorage,
        unitOfWork,
      ),
      resolveSupportRequest: new ResolveSupportRequestCommand(
        threadRepository,
        supportRequestRepository,
        deps.raiseNotification,
      ),
      markSupportRequestRead: new MarkSupportRequestReadCommand(threadRepository, messageRepository),
      internal: {
        // The delayed notice a cron sweeps — nobody asks for this, something
        // schedules it. See scheduled.ts.
        notifyUnread: new NotifyUnreadInternalCommand(messageRepository, deps.raiseNotification, adminUserReader),
      },
    },
  };
}

export type CommunicationBootstrap = ReturnType<typeof bootstrapCommunication>;
