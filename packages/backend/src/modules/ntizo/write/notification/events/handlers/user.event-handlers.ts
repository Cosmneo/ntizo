import { NotificationType } from "@ntizo/shared";
import type { EventRouter } from "../../../../../../shared/infrastructure/events/event-router";
import type { RaiseNotificationInternalCommand } from "../../../../bounded-contexts/notification/app/use-cases/raise-notification.internal.command";

export interface UserNotificationDeps {
  readonly raiseNotification: RaiseNotificationInternalCommand;
}

/**
 * What the User context's one event means to somebody's inbox.
 *
 * Registered rather than imported by the producer, like the Provider
 * handlers: the User context publishes `user.registered` and does not know
 * that anything welcomes people.
 *
 * There is no `userByEmailReader` here and there should not be — the addressee
 * arrives in the payload as an id. That lookup exists on the Provider side
 * only because an invitee is identified by an email address that may belong to
 * nobody yet.
 *
 * The first name is snapshotted from the event rather than read back from the
 * profile: an inbox row records what was true when it was raised, and a row
 * that re-read the name would quietly change what it said about the past every
 * time somebody edited their profile.
 */
export function registerUserNotificationHandlers(
  router: EventRouter,
  deps: UserNotificationDeps,
): void {
  router.on("user.registered", async (event) => {
    const payload = event.payload as { userId: string; firstName: string | null };
    await deps.raiseNotification.execute({
      type: NotificationType.Welcome,
      audience: "user",
      userId: payload.userId,
      payload: { firstName: payload.firstName },
    });
  });
}
