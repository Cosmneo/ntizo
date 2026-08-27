/**
 * One thing that happened, in whichever zone is asking.
 *
 * `type` + `payload`, not a sentence. The server writes the row without
 * knowing who will read it or in what language; the client holds the
 * translations and renders at read time. This is the notification inbox's
 * mechanism, which already does `t(\`type.${key}\`, { replace: payload })`.
 *
 * It used to be a pre-translated `description`, written before any read model
 * existed, on the reasoning that the zone that fetched it knew what it meant.
 * A real read model landed and that stopped being true: it is one table, read
 * the same way by three zones.
 */
export interface ActivityEntry {
  id: string;
  /** Translation key under `activityType.*`. */
  type: string;
  /** Interpolation values, snapshotted server-side when the row was written. */
  payload: Record<string, unknown>;
  /** ISO 8601. Formatted in the list, so three zones cannot format it three ways. */
  occurredAt: string;
}

/**
 * Turns a dotted wire type into the i18next key that reads it.
 *
 * i18next reads a dot in a key as nesting: `t("activityType.service.published")`
 * looks for `{ service: { published: ... } }` in the `activityType` namespace,
 * but the translation file is flat — one entry per event name — so the dots
 * have to go. Every segment after the first is capitalised and joined, the
 * same flattening `notification`'s presentation layer does not need only
 * because its types never had a dot in them to begin with.
 *
 * `"service.published"` -> `"servicePublished"`. A key with no dot passes
 * through unchanged.
 */
export function activityTypeKey(type: string): string {
  const [first, ...rest] = type.split(".");
  return (
    (first ?? "") +
    rest.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("")
  );
}
