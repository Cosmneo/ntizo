import { useTranslation } from "react-i18next";
import { usePageHeader } from "@/shared/lib/page-header";
import { activityTypeKey, type ActivityEntry } from "../domain/types";
import { ActivityList } from "./activity-list";

/**
 * What has happened on the platform: the audit trail.
 *
 * Approvals, suspensions, catalogue edits — the record of what administrators
 * did, which is the one activity feed whose absence is a compliance problem
 * rather than a missing convenience. Still handed an empty array:
 * `useMyActivity()` (Task 8) is the caller's own history, not the platform's
 * audit trail — a different slice of the same table, not this task's to
 * wire. See `provider-activity-page.tsx` for the same reasoning.
 */
export function AdminActivityPage() {
  const { t, i18n } = useTranslation("admin");

  usePageHeader(t("nav.activity"), t("activityHint"));

  const renderDescription = (entry: ActivityEntry) =>
    t(`activityType.${activityTypeKey(entry.type)}`, { replace: entry.payload });

  return (
    <div className="max-w-4xl">
      <ActivityList
        entries={[]}
        loading={false}
        locale={i18n.resolvedLanguage ?? i18n.language}
        title={t("activityTitle")}
        emptyTitle={t("activityEmptyTitle")}
        emptyBody={t("activityEmpty")}
        renderDescription={renderDescription}
      />
    </div>
  );
}
