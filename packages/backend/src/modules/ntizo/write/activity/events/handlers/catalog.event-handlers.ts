import type { EventRouter } from "../../../../../../shared/infrastructure/events/event-router";
import type { ServiceNameReaderPort } from "../../../../bounded-contexts/activity/app/ports/outbound/service-name-reader.port";
import type { RecordActivityInternalPort } from "../../../../bounded-contexts/activity/app/ports/inbound/record-activity.internal.command.port";

export interface CatalogActivityDeps {
  readonly recordActivity: RecordActivityInternalPort;
  readonly serviceNameReader: ServiceNameReaderPort;
}

/**
 * A read failure must not cost the row entirely.
 *
 * `ServiceNameReaderPort.findNameById` can throw (a transient DB error, a
 * dropped connection) — that is a different case from the null it returns
 * for "no such service", and this handler treats both the same on purpose:
 * a miss still records the action, just nameless, per this file's own
 * docblock. Without this catch, a throw would propagate out of the
 * `router.on(...)` callback; `EventRouter.dispatch`'s per-handler catch
 * swallows it, so the whole `recordActivity.execute` call below would never
 * run and no row would be written at all — "you did something" losing to
 * nothing, the opposite of the guarantee this file makes.
 */
async function resolveServiceName(
  reader: ServiceNameReaderPort,
  serviceId: string,
): Promise<string | null> {
  try {
    return await reader.findNameById(serviceId);
  } catch (error) {
    console.error("[activity] could not resolve a service's name", error);
    return null;
  }
}

/**
 * What three of the Catalog context's events mean to somebody's history.
 *
 * `service.updated` is not here — like `provider.updated`, it says nothing a
 * person would read back.
 *
 * `service.created`/`published`/`unpublished` carry only `serviceId`, so
 * each snapshots the service's *name* through `ServiceNameReaderPort` — see
 * that port's docblock for how it resolves the provider's own
 * `source_locale` rather than guessing a language. `serviceId` travels
 * alongside `serviceName` in the payload — not just the resolved string —
 * so a later change can re-resolve the name in a reader's own language with
 * no migration and no backfill. A row still gets written when the name
 * cannot be resolved (a service deleted since, or the lookup itself
 * failing); "you published something" outlives "you published X" rather
 * than being silently dropped.
 */
export function registerCatalogActivityHandlers(
  router: EventRouter,
  deps: CatalogActivityDeps,
): void {
  router.on("service.created", async (event) => {
    const payload = event.payload as { serviceId: string; actorUserId: string };
    const serviceName = await resolveServiceName(deps.serviceNameReader, payload.serviceId);
    await deps.recordActivity.execute({
      actorUserId: payload.actorUserId,
      type: "service.created",
      payload: { serviceId: payload.serviceId, serviceName },
      occurredAt: event.occurredOn,
    });
  });

  router.on("service.published", async (event) => {
    const payload = event.payload as { serviceId: string; actorUserId: string };
    const serviceName = await resolveServiceName(deps.serviceNameReader, payload.serviceId);
    await deps.recordActivity.execute({
      actorUserId: payload.actorUserId,
      type: "service.published",
      payload: { serviceId: payload.serviceId, serviceName },
      occurredAt: event.occurredOn,
    });
  });

  router.on("service.unpublished", async (event) => {
    const payload = event.payload as { serviceId: string; actorUserId: string };
    const serviceName = await resolveServiceName(deps.serviceNameReader, payload.serviceId);
    await deps.recordActivity.execute({
      actorUserId: payload.actorUserId,
      type: "service.unpublished",
      payload: { serviceId: payload.serviceId, serviceName },
      occurredAt: event.occurredOn,
    });
  });
}
