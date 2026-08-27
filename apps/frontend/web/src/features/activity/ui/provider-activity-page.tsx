import { useTranslation } from "react-i18next";
import { useActiveProvider } from "@/features/provider/viewmodel/use-active-provider";
import { usePageHeader } from "@/shared/lib/page-header";
import { ActivityList } from "./activity-list";

/**
 * What has happened in this workspace — not wired to real data yet.
 *
 * Still handed an empty array: `useMyActivity()` (Task 8) is the caller's
 * *own* history, and this feed is a workspace's — a different slice of the
 * same table that is not this task's to wire (follow-up #55: the
 * provider-scoped read model this needs — grouped by provider, not by actor
 * — did not exist before this task, and inventing a new query surface was
 * out of scope).
 *
 * `renderDescription` below is a **stub**, not a real renderer. It used to
 * call `t(\`activityType.${activityTypeKey(entry.type)}\`, { replace:
 * entry.payload })` against the `provider` i18next namespace — but
 * `provider.json` has no `activityType.*` keys at all; only `account.json`
 * does. With `entries={[]}` that call was never actually made, so it typechecked,
 * looked wired, and would have rendered the literal string
 * `activityType.servicePublished` for every row the moment this page got
 * real data. Before wiring this for real: add a provider-scoped activity
 * query, add `activityType.*` keys to `provider.json` in all eight locales,
 * and render through `describeActivity` (`viewmodel/describe-activity.ts`)
 * rather than a second copy of its null-name fallback — that is the one
 * real implementation, used today by `customer-activity-page.tsx`.
 */
export function ProviderActivityPage() {
  const { t, i18n } = useTranslation("provider");
  const { activeProvider } = useActiveProvider();

  usePageHeader(t("nav.activity"), activeProvider?.name);

  if (!activeProvider) return null;

  // Never called while `entries` is `[]` — exists only so `ActivityList`'s
  // required `renderDescription` prop has something to satisfy it. See this
  // file's docblock before making it do anything real.
  const renderDescription = (): string => "";

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
