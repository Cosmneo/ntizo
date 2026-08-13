import { useTranslation } from "react-i18next";
import { usePageHeader } from "@/shared/lib/page-header";
import { ActivityList } from "./activity-list";

/**
 * What has happened on the platform: the audit trail.
 *
 * Approvals, suspensions, catalogue edits — the record of what administrators
 * did, which is the one activity feed whose absence is a compliance problem
 * rather than a missing convenience. Empty until something writes it; see
 * `provider-activity-page.tsx`.
 */
export function AdminActivityPage() {
  const { t, i18n } = useTranslation("admin");

  usePageHeader(t("nav.activity"), t("activityHint"));

  return (
    <div className="max-w-4xl">
      <ActivityList
        entries={[]}
        loading={false}
        locale={i18n.resolvedLanguage ?? i18n.language}
        title={t("activityTitle")}
        emptyTitle={t("activityEmptyTitle")}
        emptyBody={t("activityEmpty")}
      />
    </div>
  );
}
