import type { TFunction } from "i18next";
import { activityTypeKey, type ActivityEntry } from "../domain/types";

/**
 * The full sentence for one activity row: the `activityType.*` template for
 * `entry.type`, interpolated against `entry.payload`.
 *
 * `serviceName`/`providerName` are `null` when the row they named was
 * deleted before this read happened — the event still occurred, the name
 * just outlived it. `withFallbackNames` swaps a translated generic noun in
 * for a `null` name before interpolation runs, so the sentence stays whole
 * ("Published a service") instead of `t`'s `replace` leaving `{{serviceName}}`
 * a blank gap.
 *
 * Several locales put that placeholder at the *front* of the sentence
 * (`de-DE`: `"{{serviceName}} veröffentlicht"`, `nl-NL`:
 * `"{{serviceName}} gepubliceerd"`) — a substituted fallback then lands
 * sentence-initial carrying the lowercase article its JSON entry was
 * written with (`"un service"`, `"een dienst"`). Capitalising those nouns in
 * the JSON is *not* the fix: `fr-FR`'s `providerInviteAccepted` puts the
 * same placeholder mid-sentence (`"Rejoint {{providerName}}"`, because
 * organisations are idiomatic subjects of *rejoindre* and an object-first
 * order there would read as the provider having joined itself) — a
 * capitalised fallback noun would be correct in one key and wrong in the
 * other, from the same JSON string. So the capital is decided here, at the
 * render site, once the whole sentence exists: only when a fallback was
 * actually substituted, never when the interpolated value is a name someone
 * chose — a service genuinely called "iPhone repair" is left exactly as
 * typed, in whatever case its owner gave it.
 *
 * `context: entry.payload.to` is i18next's own outcome-selector, not a
 * second vocabulary: the wire type stays the single `provider.status.decided`
 * (`ACTIVITY_TYPES` is unchanged), but `to` — the `ProviderStatus` an admin
 * moved the provider *to* (`packages/shared`'s `PROVIDER_STATUSES`: `active`,
 * `rejected`, `suspended`, `archived`; `decide()` never targets `pending`) —
 * picks `activityType.providerStatusDecided_<to>` when that key exists and
 * falls back to the bare `activityType.providerStatusDecided` otherwise
 * (i18next's own resolution order: the context key is tried first, the plain
 * key second — see `Interpolator`/`Translator#extendTranslation` in
 * i18next 23.16.8). Every other event's payload has no `to`, so `context` is
 * `undefined` for them and this is a no-op. Before this, every outcome of an
 * admin's decision rendered as the same "Reviewed {{providerName}}" — an
 * approval and a rejection of two different providers left one
 * indistinguishable sentence each in a person's own audit trail.
 */
export function describeActivity(t: TFunction, entry: ActivityEntry): string {
  const { replace, usedFallback } = withFallbackNames(t, entry.payload);
  const context = typeof entry.payload.to === "string" ? entry.payload.to : undefined;
  const description = t(`activityType.${activityTypeKey(entry.type)}`, {
    replace,
    context,
  }) as string;
  return usedFallback ? capitalizeFirst(description) : description;
}

/**
 * `payload`, with an explicitly-`null` `serviceName`/`providerName`
 * replaced by a translated placeholder noun (`activityType.unnamedService`
 * / `activityType.unnamedProvider`). Every other field — `email`, `rating`,
 * whatever a given event carries — passes through untouched.
 *
 * A field that is simply *absent* — `providerName` is never part of a
 * `service.published` payload at all — is left alone and does not count as
 * a fallback: the template this payload is read through never names a
 * placeholder that was not there to begin with, so there is nothing for the
 * caller to capitalise for.
 */
function withFallbackNames(
  t: TFunction,
  payload: Record<string, unknown>,
): { replace: Record<string, unknown>; usedFallback: boolean } {
  const serviceIsNull = payload.serviceName === null;
  const providerIsNull = payload.providerName === null;
  return {
    replace: {
      ...payload,
      ...(serviceIsNull ? { serviceName: t("activityType.unnamedService") } : {}),
      ...(providerIsNull ? { providerName: t("activityType.unnamedProvider") } : {}),
    },
    usedFallback: serviceIsNull || providerIsNull,
  };
}

function capitalizeFirst(text: string): string {
  return text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1);
}
