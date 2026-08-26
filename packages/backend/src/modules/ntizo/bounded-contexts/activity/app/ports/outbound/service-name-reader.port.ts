/**
 * A service's name in one language, as the Activity context needs it to
 * snapshot a history row.
 *
 * **Not a mirror of `ProviderNameReaderPort`.** A provider's `name` is one
 * column on one row; a service's name is not on `service` at all — it lives
 * in `service_translation(serviceId, locale, name)`, one row per language,
 * unique on `(serviceId, locale)`, with nothing marking which one the
 * provider actually wrote. Picking "the original" by oldest `updatedAt`
 * cannot recover that either: `service.repository.ts` deletes and
 * re-inserts every translation on each save, so all of a service's
 * translations carry the same fresh timestamp after any edit.
 *
 * **This port freezes on ONE language and is not locale-aware.** `locale` is
 * the caller's preference (the write-side handler passes `DEFAULT_LOCALE`);
 * the adapter returns that language's row when it exists, and otherwise
 * falls back deterministically — ordered by locale — to some other
 * translation of the same service, rather than to whatever the query
 * planner happens to return first. It does not attempt to guess which
 * language the provider actually wrote in.
 */
export interface ServiceNameReaderPort {
  /**
   * The service's name in `locale`, or a deterministic fallback (by locale,
   * ascending) when that language has no translation. Null only when the
   * service has no translation at all — typically because it no longer
   * exists.
   */
  findNameById(serviceId: string, locale: string): Promise<string | null>;
}
