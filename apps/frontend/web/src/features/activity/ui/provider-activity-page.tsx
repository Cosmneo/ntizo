import { useTranslation } from "react-i18next";
import { useActiveProvider } from "@/features/provider/viewmodel/use-active-provider";
import { usePageHeader } from "@/shared/lib/page-header";
import { ActivityList } from "./activity-list";

/**
 * What has happened in this workspace.
 *
 * No data yet: nothing in the backend writes activity — there is no booking,
 * payment or audit context to write it — so the list is handed an empty array
 * and says so. The page is real and routable; it is the events that are still
 * to come, and `loading` is wired to a constant rather than removed so that
 * connecting a query later is one line.
 */
export function ProviderActivityPage() {
  const { t, i18n } = useTranslation("provider");
  const { activeProvider } = useActiveProvider();

  usePageHeader(t("nav.activity"), activeProvider?.name);

  if (!activeProvider) return null;

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
      />
    </div>
  );
}
