import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { serviceTranslation } from "../../../../../shared/infrastructure/database/catalog/schemas";
import type { ServiceNameReaderPort } from "../../../app/ports/outbound/service-name-reader.port";

/**
 * The single place the Activity context reads a service's name.
 *
 * Unlike `DrizzleProviderNameReader`, this is not one column off one row:
 * `service_translation` carries one row per language for a given service,
 * unique on `(serviceId, locale)`, with nothing marking which one the
 * provider actually wrote — see `ServiceNameReaderPort`'s docblock for why
 * picking by `updatedAt` cannot recover that either.
 *
 * So this reads `locale` first, and falls back — deterministically, by
 * locale, ascending — only when that language has no row for the service.
 * It never guesses which language the provider prefers.
 */
export class DrizzleServiceNameReader implements ServiceNameReaderPort {
  async findNameById(serviceId: string, locale: string): Promise<string | null> {
    const db = getDb();

    const [preferred] = await db
      .select({ name: serviceTranslation.name })
      .from(serviceTranslation)
      .where(
        and(eq(serviceTranslation.serviceId, serviceId), eq(serviceTranslation.locale, locale)),
      )
      .limit(1);
    if (preferred) return preferred.name;

    // No row in the preferred locale. Ordered by locale rather than left to
    // whatever the planner returns first, so two calls for the same
    // unresolved service agree with each other.
    const [fallback] = await db
      .select({ name: serviceTranslation.name })
      .from(serviceTranslation)
      .where(eq(serviceTranslation.serviceId, serviceId))
      .orderBy(asc(serviceTranslation.locale))
      .limit(1);
    return fallback?.name ?? null;
  }
}
