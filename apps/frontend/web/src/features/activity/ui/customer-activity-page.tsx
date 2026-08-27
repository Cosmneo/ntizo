import { useTranslation } from "react-i18next";
import { Button } from "@ntizo/frontend-ui";
import type { ActivityEntry } from "../domain/types";
import { useMyActivity } from "../viewmodel/use-activity";
import { describeActivity } from "../viewmodel/describe-activity";
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
 * task's to wire. `renderDescription` delegates to `describeActivity`
 * (`viewmodel/describe-activity.ts`), which reads the `account` namespace's
 * own `activityType.*` keys and handles the null-name fallback and its
 * capitalisation — kept out of this component so it can be unit-tested
 * against real translation resources without mounting a page.
 */
export function CustomerActivityPage() {
  const { t, i18n } = useTranslation("account");
  const { entries, loading, hasMore, loadMore } = useMyActivity();

  const renderDescription = (entry: ActivityEntry) => describeActivity(t, entry);

  return (
    // Same reasoning as `placeholder-pages.tsx`'s Shell: `CustomerShell`
    // already provides `.page-shell`, so this fills it rather than centring a
    // narrower measure inside it and losing the header's alignment.
    <div>
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
