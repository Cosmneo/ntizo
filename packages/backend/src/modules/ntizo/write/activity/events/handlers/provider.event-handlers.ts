import type { EventRouter } from "../../../../../../shared/infrastructure/events/event-router";
import type { ProviderNameReaderPort } from "../../../../bounded-contexts/activity/app/ports/outbound/provider-name-reader.port";
import type { RecordActivityInternalPort } from "../../../../bounded-contexts/activity/app/ports/inbound/record-activity.internal.command.port";

export interface ProviderActivityDeps {
  readonly recordActivity: RecordActivityInternalPort;
  readonly providerNameReader: ProviderNameReaderPort;
}

/**
 * A read failure must not cost the row entirely.
 *
 * `ProviderNameReaderPort.findNameById` can throw (a transient DB error, a
 * dropped connection) — a different case from the null it returns for "no
 * such provider", and this handler treats both the same on purpose: a miss
 * still records the action, just nameless, per this file's own docblock.
 * Without this catch, a throw would propagate out of the `router.on(...)`
 * callback; `EventRouter.dispatch`'s per-handler catch swallows it, so the
 * whole `recordActivity.execute` call below would never run and no row
 * would be written at all — "you did something" losing to nothing, the
 * opposite of the guarantee this file makes.
 */
async function resolveProviderName(
  reader: ProviderNameReaderPort,
  providerId: string,
): Promise<string | null> {
  try {
    return await reader.findNameById(providerId);
  } catch (error) {
    console.error("[activity] could not resolve a provider's name", error);
    return null;
  }
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
 * says about the past. A miss (workspace deleted since, or the lookup
 * itself failing) still records the row, just nameless — a person's history
 * losing an entry because the business it names is gone is worse than that
 * entry saying less than it once could.
 */
export function registerProviderActivityHandlers(
  router: EventRouter,
  deps: ProviderActivityDeps,
): void {
  router.on("provider.created", async (event) => {
    const payload = event.payload as { providerId: string; ownerUserId: string };
    const providerName = await resolveProviderName(deps.providerNameReader, payload.providerId);
    await deps.recordActivity.execute({
      actorUserId: payload.ownerUserId,
      type: "provider.created",
      payload: { providerName },
      occurredAt: event.occurredOn,
    });
  });

  router.on("provider.status.decided", async (event) => {
    const payload = event.payload as { providerId: string; to: string; decidedByUserId: string };
    const providerName = await resolveProviderName(deps.providerNameReader, payload.providerId);
    await deps.recordActivity.execute({
      actorUserId: payload.decidedByUserId,
      type: "provider.status.decided",
      payload: { providerName, to: payload.to },
      occurredAt: event.occurredOn,
    });
  });

  router.on("provider.invite.sent", async (event) => {
    const payload = event.payload as { actorUserId: string; email: string };
    await deps.recordActivity.execute({
      actorUserId: payload.actorUserId,
      type: "provider.invite.sent",
      payload: { email: payload.email },
      occurredAt: event.occurredOn,
    });
  });

  router.on("provider.invite.accepted", async (event) => {
    const payload = event.payload as { providerId: string; actorUserId: string };
    const providerName = await resolveProviderName(deps.providerNameReader, payload.providerId);
    await deps.recordActivity.execute({
      actorUserId: payload.actorUserId,
      type: "provider.invite.accepted",
      payload: { providerName },
      occurredAt: event.occurredOn,
    });
  });
}
