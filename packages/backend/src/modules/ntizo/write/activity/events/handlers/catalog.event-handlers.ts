import { DEFAULT_LOCALE } from "@ntizo/shared";
import type { EventRouter } from "../../../../../../shared/infrastructure/events/event-router";
import type { ServiceNameReaderPort } from "../../../../bounded-contexts/activity/app/ports/outbound/service-name-reader.port";
import type { RecordActivityInternalPort } from "../../../../bounded-contexts/activity/app/ports/inbound/record-activity.internal.command.port";

export interface CatalogActivityDeps {
  readonly recordActivity: RecordActivityInternalPort;
  readonly serviceNameReader: ServiceNameReaderPort;
}

/**
 * What three of the Catalog context's events mean to somebody's history.
 *
 * `service.updated` is not here — like `provider.updated`, it says nothing a
 * person would read back.
 *
 * `service.created`/`published`/`unpublished` carry only `serviceId`, so
 * each snapshots the service's *name* through `ServiceNameReaderPort` at
 * `DEFAULT_LOCALE` (see that port's docblock for why this is one language,
 * not a locale-aware lookup). `serviceId` travels alongside `serviceName` in
 * the payload — not just the resolved string — so a later change can
 * re-resolve the name in a reader's own language with no migration and no
 * backfill. A row still gets written when the name cannot be resolved (a
 * service deleted since); "you published something" outlives "you published
 * X" rather than being silently dropped.
 */
export function registerCatalogActivityHandlers(
  router: EventRouter,
  deps: CatalogActivityDeps,
): void {
  router.on("service.created", async (event) => {
    const payload = event.payload as { serviceId: string; actorUserId: string };
    const serviceName = await deps.serviceNameReader.findNameById(
      payload.serviceId,
      DEFAULT_LOCALE,
    );
    await deps.recordActivity.execute({
      actorUserId: payload.actorUserId,
      type: "service.created",
      payload: { serviceId: payload.serviceId, serviceName },
      occurredAt: event.occurredOn,
    });
  });

  router.on("service.published", async (event) => {
    const payload = event.payload as { serviceId: string; actorUserId: string };
    const serviceName = await deps.serviceNameReader.findNameById(
      payload.serviceId,
      DEFAULT_LOCALE,
    );
    await deps.recordActivity.execute({
      actorUserId: payload.actorUserId,
      type: "service.published",
      payload: { serviceId: payload.serviceId, serviceName },
      occurredAt: event.occurredOn,
    });
  });

  router.on("service.unpublished", async (event) => {
    const payload = event.payload as { serviceId: string; actorUserId: string };
    const serviceName = await deps.serviceNameReader.findNameById(
      payload.serviceId,
      DEFAULT_LOCALE,
    );
    await deps.recordActivity.execute({
      actorUserId: payload.actorUserId,
      type: "service.unpublished",
      payload: { serviceId: payload.serviceId, serviceName },
      occurredAt: event.occurredOn,
    });
  });
}
