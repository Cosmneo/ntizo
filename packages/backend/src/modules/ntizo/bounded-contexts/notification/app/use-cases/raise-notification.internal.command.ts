import type { NotificationType } from "@ntizo/shared";
import { Notification } from "../../domain/aggregates/notification.aggregate";
import type { NotificationRepositoryPort } from "../ports/outbound/notification.repository.port";

export type RaiseNotificationInput =
  | { type: NotificationType; audience: "user"; userId: string; payload: Record<string, unknown> }
  | {
      type: NotificationType;
      audience: "provider";
      providerId: string;
      payload: Record<string, unknown>;
    };

/**
 * The one way a notification comes into existence.
 *
 * Internal: there is no GraphQL mutation behind it and there must not be. A
 * notification is a consequence of something the platform did, never something
 * a client asks for — an endpoint that raised one would let anybody write into
 * anybody's inbox.
 *
 * **This is also where Phase 2 hangs.** Email delivery is a step appended here,
 * after the row is written, which is why the input carries the whole payload
 * rather than ids for a later reader to resolve.
 *
 * The discriminated union rather than nullable ids: the aggregate has two
 * constructors for the same reason, and a caller cannot express "both" or
 * "neither" without the compiler stopping them.
 */
export class RaiseNotificationInternalCommand {
  constructor(private readonly repo: NotificationRepositoryPort) {}

  async execute(input: RaiseNotificationInput): Promise<{ notificationId: string }> {
    const entity =
      input.audience === "user"
        ? Notification.forUser({ type: input.type, userId: input.userId, payload: input.payload })
        : Notification.forProvider({
            type: input.type,
            providerId: input.providerId,
            payload: input.payload,
          });

    return { notificationId: await this.repo.save(entity) };
  }
}
