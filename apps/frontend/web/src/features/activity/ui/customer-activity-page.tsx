import { useTranslation } from "react-i18next";
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
 * because i18next reads a dot in a key as nesting.
 */
export function CustomerActivityPage() {
  const { t, i18n } = useTranslation("account");
  const { entries, loading } = useMyActivity();

  const renderDescription = (entry: ActivityEntry) =>
    t(`activityType.${activityTypeKey(entry.type)}`, { replace: entry.payload });

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
      </div>
    </div>
  );
}
