import type { NotificationType } from "@ntizo/shared";
import { Notification } from "../../domain/aggregates/notification.aggregate";
import type { DeliverNotificationInternalPort } from "../ports/inbound/deliver-notification.internal.command.port";
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
 * **This is also where email hangs.** Phase 1 left the sentence "this is where
 * Phase 2 hangs" here; it now does. Delivery is a step appended after the row
 * is written, which is why the input carries the whole payload rather than ids
 * for a later reader to resolve — the deliverer gets the same snapshot the
 * inbox row got, not a re-read of whatever is true later.
 *
 * The discriminated union rather than nullable ids: the aggregate has two
 * constructors for the same reason, and a caller cannot express "both" or
 * "neither" without the compiler stopping them.
 */
export class RaiseNotificationInternalCommand {
  constructor(
    private readonly repo: NotificationRepositoryPort,
    /**
     * Optional so the inbox works without it — a context that wants a row and
     * no email passes nothing, and every phase-1 caller kept working
     * unchanged when this arrived.
     *
     * A port, not the sibling command, because in production this is a
     * decorator that defers the real work past the response. This class does
     * not know which it has and must not: *when* delivery runs is a wiring
     * decision.
     */
    private readonly deliverer?: DeliverNotificationInternalPort,
  ) {}

  async execute(input: RaiseNotificationInput): Promise<{ notificationId: string }> {
    const entity =
      input.audience === "user"
        ? Notification.forUser({ type: input.type, userId: input.userId, payload: input.payload })
        : Notification.forProvider({
            type: input.type,
            providerId: input.providerId,
            payload: input.payload,
          });

    const notificationId = await this.repo.save(entity);

    // Delivery cannot fail the raise. By the time this runs the inbox row
    // exists and is the thing that matters; an email that could not be sent is
    // a worse outcome than no email, and a notification lost because of one is
    // worse than both. The deliverer records its own failures on its own rows.
    //
    // **What this catch does and does not cover.** In the wiring the bootstrap
    // builds, `execute` here is the deferring adapter's: it schedules the real
    // delivery and returns, so a delivery that fails afterwards fails long
    // after this `await` resolved and nothing here can see it. That adapter
    // owns the `.catch` and the log line for that path — this one is not it.
    // What this still catches is a deliverer that rejects *before* deferring
    // (or an undecorated one, which is what the tests pass), and it exists so
    // that case cannot take the inbox row down with it.
    //
    // console.error, not the logger: getRequestScopedLogger() throws when no
    // scope is set and nothing in this repo ever sets one. tx-context.ts's
    // drainAfterCommit does the same thing for the same reason. Leave it, or
    // somebody "upgrades" it back into a bug.
    if (this.deliverer) {
      try {
        await this.deliverer.execute({ ...input, notificationId });
      } catch (error) {
        console.error("[notification] delivery failed", {
          notificationId,
          type: input.type,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { notificationId };
  }
}
