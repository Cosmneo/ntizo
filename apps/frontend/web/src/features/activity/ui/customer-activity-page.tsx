import { useTranslation } from "react-i18next";
import { ActivityList } from "./activity-list";

/**
 * What this person has done on Ntizo.
 *
 * The customer zone has no sidebar and no page header component — it is a
 * header over content — so this page carries its own title, the way the other
 * three customer pages do.
 *
 * Empty for the same reason as the other two zones: nothing writes activity
 * yet. See `provider-activity-page.tsx`.
 */
export function CustomerActivityPage() {
  const { t, i18n } = useTranslation("account");

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="type-h1">{t("activityTitle")}</h1>
      <div className="mt-8">
        <ActivityList
          entries={[]}
          loading={false}
          locale={i18n.resolvedLanguage ?? i18n.language}
          title={t("activityListTitle")}
          hint={t("activityHint")}
          emptyTitle={t("activityEmptyTitle")}
          emptyBody={t("activityEmptyBody")}
        />
      </div>
    </div>
  );
}
