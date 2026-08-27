import { DrizzleThreadRepository } from "../infrastructure/repositories/drizzle/thread.repository";
import { DrizzleMessageRepository } from "../infrastructure/repositories/drizzle/message.repository";
import { DrizzleProviderReader } from "../infrastructure/outbound-adapters/cross-bc/provider-reader.adapter";
import { StartThreadCommand } from "../app/use-cases/start-thread.command";
import { SendMessageCommand } from "../app/use-cases/send-message.command";
import { MarkThreadReadCommand } from "../app/use-cases/mark-thread-read.command";
import { NotifyUnreadInternalCommand } from "../app/use-cases/notify-unread.internal.command";
import type { RaiseNotificationInternalPort } from "../app/ports/outbound/raise-notification.port";
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
}

export function bootstrapCommunication(deps: CommunicationBootstrapDeps) {
  const threadRepository = new DrizzleThreadRepository();
  const messageRepository = new DrizzleMessageRepository();
  const providerReader = new DrizzleProviderReader();
  const unitOfWork = new DrizzleUnitOfWork();

  return {
    adapters: { threadRepository, messageRepository, providerReader, unitOfWork },
    useCases: {
      startThread: new StartThreadCommand(threadRepository, providerReader),
      sendMessage: new SendMessageCommand(threadRepository, messageRepository, unitOfWork),
      markThreadRead: new MarkThreadReadCommand(threadRepository, messageRepository),
      internal: {
        // The delayed notice a cron sweeps — nobody asks for this, something
        // schedules it. See scheduled.ts.
        notifyUnread: new NotifyUnreadInternalCommand(messageRepository, deps.raiseNotification),
      },
    },
  };
}

export type CommunicationBootstrap = ReturnType<typeof bootstrapCommunication>;
