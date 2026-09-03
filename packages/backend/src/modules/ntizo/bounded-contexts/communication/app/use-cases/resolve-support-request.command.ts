import { NotificationType } from "@ntizo/shared";
import { SupportRequestNotFoundError } from "../../domain/exceptions";
import type { ThreadRepositoryPort } from "../ports/outbound/thread.repository.port";
import type { SupportRequestRepositoryPort } from "../ports/outbound/support-request.repository.port";
import type { RaiseNotificationInternalPort } from "../ports/outbound/raise-notification.port";

export interface ResolveSupportRequestInput {
  threadId: string;
  adminUserId: string;
}

/**
 * The admin closing a request. Raised immediately, not through the sweep —
 * a resolution is a state change, not a message somebody might read in
 * time. Best-effort, like every raise in this context: the resolution is
 * saved whether or not the telling worked.
 */
export class ResolveSupportRequestCommand {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly supportRequests: SupportRequestRepositoryPort,
    private readonly raiseNotification: RaiseNotificationInternalPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: ResolveSupportRequestInput): Promise<{ threadId: string; status: "resolved" }> {
    const thread = await this.threads.findSupportThread(input.threadId);
    const request = thread ? await this.supportRequests.findByThreadId(input.threadId) : null;
    if (!thread || !request) throw new SupportRequestNotFoundError();

    const resolved = request.resolve(input.adminUserId, this.now());
    await this.supportRequests.save(resolved);

    const payload = {
      threadId: input.threadId,
      subject: resolved.subject,
      requestAudience: resolved.audience,
      ...(thread.providerId ? { providerId: thread.providerId } : {}),
    };
    try {
      await this.raiseNotification.execute(
        thread.providerId
          ? { type: NotificationType.SupportRequestResolved, audience: "provider", providerId: thread.providerId, payload }
          : { type: NotificationType.SupportRequestResolved, audience: "user", userId: thread.customerUserId, payload },
      );
    } catch (error) {
      console.error("[communication] could not tell the requester their request was resolved", {
        threadId: input.threadId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return { threadId: input.threadId, status: "resolved" };
  }
}
