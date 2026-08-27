/**
 * A service's display name, as the Activity context needs it to snapshot a
 * history row.
 *
 * **Not a mirror of `ProviderNameReaderPort`.** A provider's `name` is one
 * column on one row; a service's name is not on `service` at all — it lives
 * in `service_translation(serviceId, locale, name)`, one row per language,
 * unique on `(serviceId, locale)`.
 *
 * **What marks "the one the provider actually wrote" is `service.source_locale`**
 * (`service.schema.ts:40`, `NOT NULL`) — not a guess, not the oldest
 * `updatedAt` (`service.repository.ts` deletes and re-inserts every
 * translation on each save, so that column cannot distinguish them). The
 * Catalog context already resolves a service's display name this exact way,
 * for the unpublish-sweep banner (`service.repository.ts`'s
 * `unpublishServicesWithoutMembers`) — this port does the same lookup for
 * the same reason, from the Activity context's own adapter (F5).
 *
 * A `source_locale` translation is a **publish invariant**
 * (`service.aggregate.ts`'s `hasSourceName`, enforced by `Service.publish`),
 * so for `service.published` that row is guaranteed to exist. It is not
 * guaranteed for `service.created`, which fires before that invariant is
 * enforced — the fallback below exists for that gap, not as the normal path.
 *
 * The fallback is ordered by locale, ascending, and is a last resort, not a
 * second-best guess at the provider's language: over this product's locale
 * set that ordering puts `de-DE` before `en-US`, so a provider who wrote in
 * English and later added a German translation would see the German name —
 * wrong, but at least deterministic and not left to whatever the query
 * planner returns first, which is the property that actually matters here:
 * two calls for the same unresolved service must agree with each other.
 */
export interface ServiceNameReaderPort {
  /**
   * The service's name in its own `source_locale`, falling back to another
   * of its translations (ordered by locale) only when the source-locale
   * translation itself is missing. Null only when the service has no
   * translation at all — typically because it no longer exists.
   */
  findNameById(serviceId: string): Promise<string | null>;
}
