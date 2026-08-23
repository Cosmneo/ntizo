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
 */
export function NotificationsPage({ scope }: { scope: InboxScope }) {
  const { t } = useTranslation("notifications");
  const { page, isPending, isError } = useInbox(scope);
  const { markOne, markAll, isMarkingAll } = useMarkRead(scope);

  const hasUnread = page.items.some((item) => !item.read);

  return (
    <div className="flex flex-col gap-5">
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
        <InboxList
          items={page.items}
          todayIso={new Date().toISOString()}
          onMarkRead={markOne}
        />
      )}
    </div>
  );
}
