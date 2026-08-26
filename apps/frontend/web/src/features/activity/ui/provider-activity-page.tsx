import { useTranslation } from "react-i18next";
import { useActiveProvider } from "@/features/provider/viewmodel/use-active-provider";
import { usePageHeader } from "@/shared/lib/page-header";
import { activityTypeKey, type ActivityEntry } from "../domain/types";
import { ActivityList } from "./activity-list";

/**
 * What has happened in this workspace.
 *
 * Still handed an empty array: `useMyActivity()` (Task 8) is the caller's
 * *own* history, and this feed is a workspace's — a different slice of the
 * same table that is not this task's to wire. The page is real and routable;
 * `loading` stays a constant and `renderDescription` is wired for real, since
 * `ActivityList` now requires both regardless of which zone supplies the
 * rows.
 */
export function ProviderActivityPage() {
  const { t, i18n } = useTranslation("provider");
  const { activeProvider } = useActiveProvider();

  usePageHeader(t("nav.activity"), activeProvider?.name);

  if (!activeProvider) return null;

  const renderDescription = (entry: ActivityEntry) =>
    t(`activityType.${activityTypeKey(entry.type)}`, { replace: entry.payload });

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <ActivityList
        entries={[]}
        loading={false}
        locale={i18n.resolvedLanguage ?? i18n.language}
        title={t("activityTitle")}
        hint={t("activityHint")}
        emptyTitle={t("activityEmptyTitle")}
        emptyBody={t("activityEmpty")}
        renderDescription={renderDescription}
      />
    </div>
  );
}
