import { useTranslation } from "react-i18next";
import { Button } from "@ntizo/frontend-ui";
import { activityTypeKey, type ActivityEntry } from "../domain/types";
import { useMyActivity } from "../viewmodel/use-activity";
import { ActivityList } from "./activity-list";

/**
 * What this person has done on Ntizo.
 *
 * The customer zone has no sidebar and no page header component — it is a
 * header over content — so this page carries its own title, the way the other
 * three customer pages do.
 *
 * The only one of the three zones wired to `useMyActivity()` — the provider
 * and admin feeds read a different slice of the same table and are not this
 * task's to wire. `renderDescription` reads the `account` namespace's own
 * `activityType.*` keys, dotted keys flattened through `activityTypeKey`
 * because i18next reads a dot in a key as nesting. See `withFallbackNames`
 * for what happens when the name a key wants to interpolate is null.
 */
export function CustomerActivityPage() {
  const { t, i18n } = useTranslation("account");
  const { entries, loading, hasMore, loadMore } = useMyActivity();

  const renderDescription = (entry: ActivityEntry) =>
    t(`activityType.${activityTypeKey(entry.type)}`, {
      replace: withFallbackNames(entry.payload),
    });

  /**
   * `payload` as written, with a null `serviceName`/`providerName` replaced
   * by a translated placeholder noun. Every other field — `email`, `rating`,
   * whatever a given event carries — passes through untouched; `t`'s
   * `interpolation.replace` only reads the placeholders a template actually
   * names, so handing it two extra keys a template does not use is inert.
   * Declared inside the component (not module scope) because it closes over
   * `t` — pulling `t` in as a parameter instead would mean typing against
   * `TFunction`'s overloaded signature for no benefit.
   */
  function withFallbackNames(payload: Record<string, unknown>): Record<string, unknown> {
    return {
      ...payload,
      serviceName: payload.serviceName ?? t("activityType.unnamedService"),
      providerName: payload.providerName ?? t("activityType.unnamedProvider"),
    };
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="type-h1">{t("activityTitle")}</h1>
      <div className="mt-8">
        <ActivityList
          entries={entries}
          loading={loading}
          locale={i18n.resolvedLanguage ?? i18n.language}
          title={t("activityListTitle")}
          hint={t("activityHint")}
          emptyTitle={t("activityEmptyTitle")}
          emptyBody={t("activityEmptyBody")}
          renderDescription={renderDescription}
        />
        {hasMore ? (
          <Button variant="outline" className="mt-4 w-full" onClick={() => loadMore()}>
            {t("activityLoadMore")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
