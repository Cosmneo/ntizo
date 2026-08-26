import type { EventRouter } from "../../../../../../shared/infrastructure/events/event-router";
import type { ProviderNameReaderPort } from "../../../../bounded-contexts/activity/app/ports/outbound/provider-name-reader.port";
import type { RecordActivityInternalPort } from "../../../../bounded-contexts/activity/app/ports/inbound/record-activity.internal.command.port";

export interface ProviderActivityDeps {
  readonly recordActivity: RecordActivityInternalPort;
  readonly providerNameReader: ProviderNameReaderPort;
}

/**
 * What four of the Provider context's events mean to somebody's history.
 *
 * Only the four that carry an `actorUserId` (Task 4) are handled here.
 * `ACTIVITY_TYPES`'s own docblock says why the rest are silent:
 * `provider.updated` says nothing worth reading back, `member.added` /
 * `member.removed` / `invite.declined` / `invite.revoked` are the passive
 * side of an action already recorded elsewhere, and `provider.deactivated`
 * / `provider.member.role-updated` carry no actor to file a row under.
 *
 * Every payload snapshots the provider's *name*, resolved through this
 * context's own `ProviderNameReaderPort` (F5) — never a bare id. A history
 * row can outlive a rename; a bare id would let it quietly change what it
 * says about the past. A miss (workspace deleted since) still records the
 * row, just nameless — a person's history losing an entry because the
 * business it names is gone is worse than that entry saying less than it
 * once could.
 */
export function registerProviderActivityHandlers(
  router: EventRouter,
  deps: ProviderActivityDeps,
): void {
  router.on("provider.created", async (event) => {
    const payload = event.payload as { providerId: string; ownerUserId: string };
    const providerName = await deps.providerNameReader.findNameById(payload.providerId);
    await deps.recordActivity.execute({
      actorUserId: payload.ownerUserId,
      type: "provider.created",
      payload: { providerName },
      occurredAt: event.occurredOn,
    });
  });

  router.on("provider.status.decided", async (event) => {
    const payload = event.payload as { providerId: string; to: string; decidedByUserId: string };
    const providerName = await deps.providerNameReader.findNameById(payload.providerId);
    await deps.recordActivity.execute({
      actorUserId: payload.decidedByUserId,
      // ACTIVITY_TYPES spells this "provider.statusDecided" — camelCase
      // after the dot — even though the event name this handler listens on
      // is "provider.status.decided". The two strings answer different
      // questions (what the EventRouter fans out on vs. what a closed list
      // of history-row kinds contains) and are not required to match.
      type: "provider.statusDecided",
      payload: { providerName, to: payload.to },
      occurredAt: event.occurredOn,
    });
  });

  router.on("provider.invite.sent", async (event) => {
    const payload = event.payload as { actorUserId: string; email: string };
    await deps.recordActivity.execute({
      actorUserId: payload.actorUserId,
      type: "provider.inviteSent",
      payload: { email: payload.email },
      occurredAt: event.occurredOn,
    });
  });

  router.on("provider.invite.accepted", async (event) => {
    const payload = event.payload as { providerId: string; actorUserId: string };
    const providerName = await deps.providerNameReader.findNameById(payload.providerId);
    await deps.recordActivity.execute({
      actorUserId: payload.actorUserId,
      type: "provider.inviteAccepted",
      payload: { providerName },
      occurredAt: event.occurredOn,
    });
  });
}
