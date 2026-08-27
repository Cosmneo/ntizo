import type { EventRouter } from "../../../../../../shared/infrastructure/events/event-router";
import type { RecordActivityInternalPort } from "../../../../bounded-contexts/activity/app/ports/inbound/record-activity.internal.command.port";

export interface UserActivityDeps {
  readonly recordActivity: RecordActivityInternalPort;
}

/**
 * What the User context's one event means to somebody's history.
 *
 * Registered rather than imported by the producer, like the notification
 * handlers: the User context publishes `user.registered` and does not know
 * that anything keeps a history.
 */
export function registerUserActivityHandlers(router: EventRouter, deps: UserActivityDeps): void {
  router.on("user.registered", async (event) => {
    const payload = event.payload as { userId: string };
    await deps.recordActivity.execute({
      actorUserId: payload.userId,
      type: "user.registered",
      payload: {},
      occurredAt: event.occurredOn,
    });
  });
}
