import { NotificationType } from "@ntizo/shared";
import type { EventRouter } from "../../../../../../shared/infrastructure/events/event-router";
import type { UserByEmailReaderPort } from "../../../../bounded-contexts/notification/app/ports/outbound/user-by-email-reader.port";
import type { RaiseNotificationInternalCommand } from "../../../../bounded-contexts/notification/app/use-cases/raise-notification.internal.command";

export interface ProviderNotificationDeps {
  readonly raiseNotification: RaiseNotificationInternalCommand;
  readonly userByEmailReader: UserByEmailReaderPort;
}

/**
 * What the Provider context's events mean to somebody's inbox.
 *
 * One function per event, registered rather than imported by the producer: the
 * Provider context publishes and does not know who listens, which is the whole
 * reason this is a router and not a call.
 *
 * **Every payload is a snapshot** — but `provider.created`'s snapshot is
 * deliberately thin. `ProviderCreated` carries no business name to begin
 * with, and it does not need one: every row raised here with
 * `audience: "provider"` lands in that one workspace's inbox, so the reader
 * is already inside the business being welcomed and does not need it named
 * back at them. (A *personal* inbox would be different — one person can own
 * or work at several providers, so a row there would need to say which one.
 * That case does not exist yet.) What the row does snapshot is the provider
 * `type`, in case the template ever wants to greet an individual and an
 * organization differently.
 *
 * Three of Provider's eleven events produce a notification. The other eight —
 * `updated`, `deactivated`, `member.added`, `member.removed`,
 * `member.role-updated`, `invite.accepted`, `invite.declined`,
 * `invite.revoked` — are silent on purpose: they are bookkeeping, and an
 * inbox that narrates every state change is one people learn to ignore.
 * `member.role-updated` in particular is a role change between colleagues,
 * not news for anybody's inbox. Add one when somebody asks for it, not
 * because the event exists.
 */
export function registerProviderNotificationHandlers(
  router: EventRouter,
  deps: ProviderNotificationDeps,
): void {
  router.on("provider.created", async (event) => {
    const payload = event.payload as { providerId: string; type: "individual" | "organization" };
    await deps.raiseNotification.execute({
      type: NotificationType.ProviderWorkspaceWelcome,
      audience: "provider",
      providerId: payload.providerId,
      payload: { type: payload.type },
    });
  });

  router.on("provider.status.decided", async (event) => {
    const payload = event.payload as { providerId: string; from: string; to: string };

    // Only the two decisions a provider is waiting on. A move back to `pending`
    // is the platform narrating its own bookkeeping at somebody who is already
    // waiting, and `deactivated` has its own event.
    const type =
      payload.to === "active"
        ? NotificationType.ProviderVerified
        : payload.to === "rejected"
          ? NotificationType.ProviderDocumentsRequired
          : null;
    if (type === null) return;

    await deps.raiseNotification.execute({
      type,
      audience: "provider",
      providerId: payload.providerId,
      payload: { from: payload.from, to: payload.to },
    });
  });

  router.on("provider.invite.sent", async (event) => {
    const payload = event.payload as {
      providerId: string;
      inviteId: string;
      email: string;
      role: string;
    };

    // The event itself cannot say whether the invitee has an account —
    // `InviteProviderMemberCommand` never looks that up, because it does not
    // need to in order to send the invite email. So the lookup happens here,
    // on the consumer side, against the Notification context's own port
    // rather than by asking the Provider context to carry a field it has no
    // other use for.
    const invitedUserId = await deps.userByEmailReader.findUserIdByEmail(payload.email);

    // An invitee who has no account has no inbox to address. They get an
    // email — Phase 2's job — and a row keyed to nobody is not a substitute
    // for one. This is the case that made
    // `notification_delivery.notification_id` nullable in the spec: a
    // delivery can exist without an inbox item.
    if (!invitedUserId) return;

    await deps.raiseNotification.execute({
      type: NotificationType.TeamInvitation,
      audience: "user",
      userId: invitedUserId,
      payload: { providerId: payload.providerId, role: payload.role },
    });
  });
}
