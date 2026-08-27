import { useTranslation } from "react-i18next";
import { usePageHeader } from "@/shared/lib/page-header";
import { ActivityList } from "./activity-list";

/**
 * What has happened on the platform: the audit trail — not wired to real
 * data yet.
 *
 * Approvals, suspensions, catalogue edits — the record of what administrators
 * did, which is the one activity feed whose absence is a compliance problem
 * rather than a missing convenience. Still handed an empty array:
 * `useMyActivity()` (Task 8) is the caller's own history, not the platform's
 * audit trail — a different slice of the same table, not this task's to
 * wire (follow-up #55: an admin-scoped read — unfiltered by actor, behind an
 * elevated read — did not exist before this task).
 *
 * `renderDescription` below is a **stub**, not a real renderer — see
 * `provider-activity-page.tsx`'s docblock for the same reasoning: the
 * `admin` i18next namespace has no `activityType.*` keys, so the call this
 * used to make would have rendered the literal `activityType.*` key for
 * every row the moment this page got real data, rather than the sentence it
 * looked like it would. Before wiring this for real: add the admin-scoped
 * activity query, add `activityType.*` keys to `admin.json` in all eight
 * locales, and render through `describeActivity`
 * (`viewmodel/describe-activity.ts`) rather than a second copy of its
 * null-name fallback.
 */
export function AdminActivityPage() {
  const { t, i18n } = useTranslation("admin");

  usePageHeader(t("nav.activity"), t("activityHint"));

  // Never called while `entries` is `[]` — exists only so `ActivityList`'s
  // required `renderDescription` prop has something to satisfy it.
  const renderDescription = (): string => "";

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
