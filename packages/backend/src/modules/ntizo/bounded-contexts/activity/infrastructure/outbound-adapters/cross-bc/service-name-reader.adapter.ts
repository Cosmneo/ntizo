import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import {
  service,
  serviceTranslation,
} from "../../../../../shared/infrastructure/database/catalog/schemas";
import type { ServiceNameReaderPort } from "../../../app/ports/outbound/service-name-reader.port";

/**
 * The single place the Activity context reads a service's name.
 *
 * The primary path is one query: join `service` to `service_translation` on
 * `service_translation.locale = service.source_locale`, the same predicate
 * `DrizzleServiceRepository.unpublishServicesWithoutMembers` uses to name a
 * service for its own banner. That predicate is what marks "the translation
 * the provider actually wrote" — see `ServiceNameReaderPort`'s docblock for
 * why nothing else on the table can (not `updatedAt`, since every
 * translation is deleted and re-inserted on each save).
 *
 * The join returns nothing in two cases this adapter cannot tell apart, and
 * does not need to: the service no longer exists, or it exists but its
 * `source_locale` translation is missing (only reachable before
 * `Service.publish`'s `hasSourceName` invariant runs, i.e. between
 * `service.created` and a first publish). Either way, the fallback below
 * picks *some* translation of the service, ordered by locale, rather than
 * leaving the caller with nothing when one exists.
 */
export class DrizzleServiceNameReader implements ServiceNameReaderPort {
  async findNameById(serviceId: string): Promise<string | null> {
    const db = getDb();

    const [bySourceLocale] = await db
      .select({ name: serviceTranslation.name })
      .from(service)
      .innerJoin(
        serviceTranslation,
        and(
          eq(serviceTranslation.serviceId, service.id),
          eq(serviceTranslation.locale, service.sourceLocale),
        ),
      )
      .where(eq(service.id, serviceId))
      .limit(1);
    if (bySourceLocale) return bySourceLocale.name;

    // No row for `service.id` joined to its own `source_locale`. Ordered by
    // locale rather than left to whatever the planner returns first, so two
    // calls for the same unresolved service agree with each other.
    const [fallback] = await db
      .select({ name: serviceTranslation.name })
      .from(serviceTranslation)
      .where(eq(serviceTranslation.serviceId, serviceId))
      .orderBy(asc(serviceTranslation.locale))
      .limit(1);
    return fallback?.name ?? null;
  }
}
