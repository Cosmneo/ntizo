import { NotificationNotFoundError, NotProviderMemberError } from "../../domain/exceptions";
import type { NotificationRepositoryPort } from "../ports/outbound/notification.repository.port";
import type { ProviderMemberReaderPort } from "../ports/outbound/provider-member-reader.port";

/**
 * Marking one item read.
 *
 * The entitlement check lives in the repository's statement, not here — a check
 * in this command followed by a write is a window in which membership can be
 * revoked. This class's job is to turn "nothing was marked" into a refusal
 * rather than a silent success, which is the rule `RemoveReviewCommand` and
 * `ManageClosures` both follow: a click that changes nothing must not read as
 * "worked".
 */
export class MarkNotificationReadCommand {
  constructor(private readonly repo: NotificationRepositoryPort) {}

  async execute(input: { requesterUserId: string; notificationId: string }): Promise<{ ok: true }> {
    const marked = await this.repo.markRead(input.notificationId, input.requesterUserId);
    if (!marked) throw new NotificationNotFoundError();
    return { ok: true };
  }
}

/**
 * Marking a whole inbox read, for the caller and only the caller.
 *
 * One command for both inboxes, discriminated by whether `providerId` arrives.
 * The membership check IS here rather than in the statement, unlike
 * `markRead`: this one refuses an entire workspace, and a caller who is not a
 * member should be told so instead of receiving `{ marked: 0 }`, which reads as
 * "your inbox was already clear".
 */
export class MarkAllNotificationsReadCommand {
  constructor(
    private readonly repo: NotificationRepositoryPort,
    private readonly members: ProviderMemberReaderPort,
  ) {}

  async execute(input: {
    requesterUserId: string;
    providerId?: string | undefined;
  }): Promise<{ marked: number }> {
    if (input.providerId === undefined) {
      return { marked: await this.repo.markAllReadForUser(input.requesterUserId) };
    }

    if (!(await this.members.isMember(input.providerId, input.requesterUserId))) {
      throw new NotProviderMemberError(input.providerId);
    }
    return {
      marked: await this.repo.markAllReadForProvider(input.providerId, input.requesterUserId),
    };
  }
}
