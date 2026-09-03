import { NotificationType } from "@ntizo/shared";
import type { AdminUserReaderPort } from "../ports/outbound/admin-user-reader.port";
import type { DueMessage, MessageRepositoryPort } from "../ports/outbound/message.repository.port";
import type {
  RaiseNotificationInput,
  RaiseNotificationInternalPort,
} from "../ports/outbound/raise-notification.port";
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
 * **Who is told, and with what, is `tell()`'s job** — it now varies by
 * `threadType`, not just by which side sent the message; see that method's
 * doc comment for the three cases.
 *
 * **One bad row does not stop the sweep.** Each message is raised and marked
 * inside its own `try`; a failure is counted and the message is left
 * unmarked — `notifiedAt` stays null — so the next sweep retries exactly that
 * message and nothing else in the batch is lost to it. `markNotified` runs
 * only after at least one raise actually succeeded, so a message nobody
 * could be told about is never marked as if it had.
 */
export class NotifyUnreadInternalCommand implements NotifyUnreadInternalPort {
  constructor(
    private readonly messages: MessageRepositoryPort,
    private readonly raiseNotification: RaiseNotificationInternalPort,
    private readonly admins: AdminUserReaderPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: NotifyUnreadInternalInput): Promise<{ notified: number; failed: number }> {
    const due = await this.messages.claimDueForNotice(input.limit, this.now());

    let notified = 0;
    let failed = 0;

    for (const message of due) {
      try {
        const delivered = await this.tell(message);
        if (!delivered) throw new Error("nobody could be told");
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

  /**
   * Who is told, and with what. Returns `false` only when there were people
   * to tell and every raise failed — that is the case worth retrying. An
   * empty admin list is not a failure: retrying would never produce an
   * admin, and the queue shows the request regardless.
   *
   * **The inquiry branch is phase 1's rule, now read off `senderSide`**
   * rather than compared against `customerUserId` — same recipients as
   * before, one field instead of an equality on ids.
   *
   * **The support branches:** a platform reply goes to the requester side
   * — the person, or the provider's members through `audience: "provider"`,
   * which is how the notification context already fans out to a team. A
   * requester-side message goes to every admin, one raise each, each in
   * its own try; one admin's failure must not cost the others their
   * notice, and a raise that succeeded is not repeated on the next sweep
   * because the message is marked once any admin was told.
   */
  private async tell(message: DueMessage): Promise<boolean> {
    if (message.threadType === "inquiry") {
      const recipient =
        message.senderSide === "customer"
          ? // Non-null on an inquiry by thread_inquiry_has_provider — the database's guarantee, and this is the one place the code leans on it.
            ({ audience: "provider", providerId: message.providerId! } as const)
          : ({ audience: "user", userId: message.customerUserId } as const);
      await this.raiseNotification.execute({
        type: NotificationType.NewMessage,
        ...recipient,
        payload: { threadId: message.threadId },
      });
      return true;
    }

    const payload: Record<string, unknown> = {
      threadId: message.threadId,
      subject: message.subject ?? "",
      requestAudience: message.providerId ? "provider" : "customer",
      ...(message.providerId ? { providerId: message.providerId } : {}),
    };

    if (message.senderSide === "platform") {
      const raise: RaiseNotificationInput = message.providerId
        ? { type: NotificationType.SupportReply, audience: "provider", providerId: message.providerId, payload }
        : { type: NotificationType.SupportReply, audience: "user", userId: message.customerUserId, payload };
      await this.raiseNotification.execute(raise);
      return true;
    }

    const adminIds = await this.admins.findAdminUserIds();
    if (adminIds.length === 0) return true;
    let told = 0;
    for (const userId of adminIds) {
      try {
        await this.raiseNotification.execute({
          type: NotificationType.SupportRequestMessage,
          audience: "user",
          userId,
          payload,
        });
        told++;
      } catch (error) {
        console.error("[communication] could not tell an admin about a support message", {
          messageId: message.id,
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return told > 0;
  }
}
