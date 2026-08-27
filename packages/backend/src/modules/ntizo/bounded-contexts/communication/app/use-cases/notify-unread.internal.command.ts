import { NotificationType } from "@ntizo/shared";
import type { MessageRepositoryPort } from "../ports/outbound/message.repository.port";
import type { RaiseNotificationInternalPort } from "../ports/outbound/raise-notification.port";
import type {
  NotifyUnreadInternalInput,
  NotifyUnreadInternalPort,
} from "../ports/inbound/notify-unread.internal.command.port";

/**
 * The delayed notice: turns a message nobody read in time into a
 * notification.
 *
 * Nothing is raised when a message is sent — `Message.compose` only stamps
 * `notifyDueAt`. This is the sweep a cron calls (Task 6 wires the schedule;
 * this class does not know it runs on one) that turns "due, still unread, not
 * yet notified" into an actual bell entry plus email. A fast back-and-forth
 * produces no email at all, because the reply marks the message read — via
 * `MarkThreadReadCommand` — before this ever sees it: `claimDueForNotice`
 * already filters on all three conditions, so nothing here re-checks them.
 *
 * **The recipient is the side the sender did not send from.** A message the
 * customer sent notifies the provider's members; a message any provider
 * member sent notifies the customer. Resolved against `customerUserId`, not
 * against a role stored on the message itself — the same thing
 * `MessageRepositoryPort.markReadForViewer`'s doc comment already says about
 * "side", for the same reason.
 *
 * **One bad row does not stop the sweep.** Each message is raised and marked
 * inside its own `try`; a failure is counted and the message is left
 * unmarked — `notifiedAt` stays null — so the next sweep retries exactly that
 * message and nothing else in the batch is lost to it. `markNotified` runs
 * only after `raiseNotification.execute` actually resolved, so a message
 * whose raise threw is never marked as if it had succeeded.
 */
export class NotifyUnreadInternalCommand implements NotifyUnreadInternalPort {
  constructor(
    private readonly messages: MessageRepositoryPort,
    private readonly raiseNotification: RaiseNotificationInternalPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: NotifyUnreadInternalInput): Promise<{ notified: number; failed: number }> {
    const due = await this.messages.claimDueForNotice(input.limit, this.now());

    let notified = 0;
    let failed = 0;

    for (const message of due) {
      try {
        const recipient =
          message.senderUserId === message.customerUserId
            ? ({ audience: "provider", providerId: message.providerId } as const)
            : ({ audience: "user", userId: message.customerUserId } as const);

        await this.raiseNotification.execute({
          type: NotificationType.NewMessage,
          ...recipient,
          payload: { threadId: message.threadId },
        });

        await this.messages.markNotified(message.id, this.now());
        notified++;
      } catch (error) {
        // A notification lost because one bad row took the whole batch down
        // is worse than a message that is retried on the next sweep. Left
        // unmarked on purpose — see the class doc comment.
        //
        // console.error, not the logger: getRequestScopedLogger() throws when
        // no scope is set and a cron invocation sets none — the same reason
        // raise-notification.internal.command.ts and
        // record-activity.internal.command.ts both do this instead.
        failed++;
        console.error("[communication] could not notify an unread message", {
          messageId: message.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { notified, failed };
  }
}
