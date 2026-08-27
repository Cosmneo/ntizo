import { useTranslation } from "react-i18next";
import { Bell } from "lucide-react";
import { Button } from "@ntizo/frontend-ui";
import { EmptyCard } from "@/shared/components/empty-card";
import {
  useInbox,
  type InboxScope,
} from "@/features/notifications/viewmodel/use-inbox";
import { useMarkRead } from "@/features/notifications/viewmodel/use-mark-read";
import { InboxList } from "@/features/notifications/ui/inbox-list";
import { useMyActivity } from "@/features/activity/viewmodel/use-activity";
import { describeActivity } from "@/features/activity/viewmodel/describe-activity";
import { ActivityList } from "@/features/activity/ui/activity-list";
import type { ActivityEntry } from "@/features/activity/domain/types";

/**
 * One inbox, whichever scope asks for it.
 *
 * The personal inbox and a workspace's inbox differ only in which query feeds
 * them — `useInbox` and `useMarkRead` already branch on `scope` — so one page
 * serves both routes rather than two copies that would drift the moment one
 * of them changes. `scope` also decides the heading: "Notifications" for a
 * person, "Workspace notifications" for an organization, because the same
 * word means a different inbox depending on who is reading it.
 *
 * No zone-specific chrome here on purpose. The customer route renders this
 * directly with nothing around it; the provider route wraps it in the same
 * width constraint its sibling pages use and feeds the workspace's own title
 * to the shell's header. Neither wrapper belongs inside a component the other
 * zone also renders.
 *
 * Beside the inbox sits this person's own activity — `useMyActivity()` reads
 * the caller's history, not either scope's inbox, so the same feed and the
 * same "account" namespace copy that already labels it on `CustomerActivityPage`
 * is accurate whether the inbox on screen is a person's or a workspace's.
 * `grid-cols-[minmax(0,1fr)_320px]` rather than a bare `1fr`: a bare `1fr`
 * resolves to `minmax(auto,1fr)`, whose floor is the inbox's own content
 * width, which is exactly what pushed the site's header into a sideways
 * scroll on a phone. Below `lg` there is no column rule at all, so the grid's
 * one implicit column stacks both cells — the activity column lands under the
 * inbox, not beside it and not hidden, because a phone reading notifications
 * scrolls past them to the history next.
 */
export function NotificationsPage({ scope }: { scope: InboxScope }) {
  const { t, i18n } = useTranslation("notifications");
  const { t: tAccount } = useTranslation("account");
  const { page, isPending, isError } = useInbox(scope);
  const { markOne, markAll, isMarkingAll } = useMarkRead(scope);
  const { entries, loading: activityLoading } = useMyActivity();

  const hasUnread = page.items.some((item) => !item.read);
  const renderActivityDescription = (entry: ActivityEntry) =>
    describeActivity(tAccount, entry);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="type-h1">
            {scope.kind === "provider" ? t("providerTitle") : t("title")}
          </h1>
          {/* Rendered only when it can do something. An action over a list it
              cannot change is a button that lies. */}
          {hasUnread && (
            <Button
              type="button"
              variant="outline"
              disabled={isMarkingAll}
              onClick={() => markAll()}
            >
              {t("markAllRead")}
            </Button>
          )}
        </div>

        {isError ? (
          <p className="type-body text-[var(--color-destructive)]">{t("loadError")}</p>
        ) : isPending ? null : page.total === 0 ? (
          <EmptyCard framed badge={Bell} title={t("emptyTitle")} body={t("emptyBody")} />
        ) : (
          <>
            <InboxList
              items={page.items}
              todayIso={new Date().toISOString()}
              onMarkRead={markOne}
            />
            {/* Said plainly rather than with a "load more" that does nothing:
                paging this list needs an offset control this page does not
                carry yet, and a control that lies is worse than a sentence
                that does not. Same ruling `provider-reviews.tsx` already made
                for the same reason. */}
            {page.total > page.items.length && (
              <p className="type-caption text-[var(--color-muted-foreground)]">
                {t("showingCount", { shown: page.items.length, total: page.total })}
              </p>
            )}
          </>
        )}
      </div>

      <ActivityList
        entries={entries}
        loading={activityLoading}
        locale={i18n.resolvedLanguage ?? i18n.language}
        title={tAccount("activityListTitle")}
        hint={tAccount("activityHint")}
        emptyTitle={tAccount("activityEmptyTitle")}
        emptyBody={tAccount("activityEmptyBody")}
        renderDescription={renderActivityDescription}
        skeletonRows={4}
      />
    </div>
  );
}
