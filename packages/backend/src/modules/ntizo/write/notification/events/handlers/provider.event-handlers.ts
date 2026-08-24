import { NotificationType } from "@ntizo/shared";
import type { EventRouter } from "../../../../../../shared/infrastructure/events/event-router";
import type { ProviderNameReaderPort } from "../../../../bounded-contexts/notification/app/ports/outbound/provider-name-reader.port";
import type { UserByEmailReaderPort } from "../../../../bounded-contexts/notification/app/ports/outbound/user-by-email-reader.port";
import type { RaiseNotificationInternalCommand } from "../../../../bounded-contexts/notification/app/use-cases/raise-notification.internal.command";

export interface ProviderNotificationDeps {
  readonly raiseNotification: RaiseNotificationInternalCommand;
  readonly userByEmailReader: UserByEmailReaderPort;
  readonly providerNameReader: ProviderNameReaderPort;
}

/**
 * What the Provider context's events mean to somebody's inbox.
 *
 * One function per event, registered rather than imported by the producer: the
 * Provider context publishes and does not know who listens, which is the whole
 * reason this is a router and not a call.
 *
 * **Every payload is a snapshot, and never a bare foreign key** —
 * `notification.schema.ts` states the rule, and the two handlers below that
 * name a provider follow it two different ways. `provider.created`'s
 * snapshot is deliberately thin: `ProviderCreated` carries no business name
 * to begin with, and it does not need one, because every row raised here
 * with `audience: "provider"` lands in that one workspace's inbox — the
 * reader is already inside the business being welcomed. What it does
 * snapshot is the provider `type`, in case the template ever wants to greet
 * an individual and an organization differently.
 *
 * `provider.invite.sent` is the opposite case: it addresses a *personal*
 * inbox, one person can belong to several workspaces, and `audience: "user"`
 * means `notification.provider_id` stays NULL — no FK, no cascade, nothing
 * that would clean the row up or keep it resolvable once the workspace it
 * mentions is gone. So that row snapshots the provider's *name*, not just
 * its id, via `ProviderNameReaderPort` — the same consumer-side-lookup shape
 * `userByEmailReader` already uses below, for the same reason: the Provider
 * context has no other use for the field, so the lookup lives here instead
 * of asking that context to carry it.
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

    // Unlike `provider.created`'s row, this one lands in a *personal* inbox —
    // one person can belong to several workspaces — so it must say which
    // business the invitation is for, and it must say it as a snapshot, not
    // as `providerId` alone: `notification.provider_id` stays NULL on a
    // `audience: "user"` row (see `notification.schema.ts`'s addressee
    // CHECKs), so the cascade that deletes a workspace's own inbox on
    // deletion never reaches this one, and a bare id would go unresolvable
    // the moment the workspace it names is gone.
    const providerName = await deps.providerNameReader.findNameById(payload.providerId);

    // A miss here is not the same case as a miss above: the invitee is real
    // and the invitation is still worth delivering even if the workspace it
    // names cannot be resolved right now (a race with the provider being
    // deleted, or read-replica lag) — the row just reads as unnamed rather
    // than being suppressed. `providerId` is kept alongside it in case a
    // future template wants to link back to the workspace.
    await deps.raiseNotification.execute({
      type: NotificationType.TeamInvitation,
      audience: "user",
      userId: invitedUserId,
      payload: { providerId: payload.providerId, providerName, role: payload.role },
    });
  });
}
