import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { NotificationBell } from "@/features/notifications/ui/notification-bell";
import { useUnreadCount } from "@/features/notifications/viewmodel/use-unread-count";
import type { InboxScope } from "@/features/notifications/viewmodel/use-inbox";

/**
 * The bell, linked to the inbox it opens, with an accessible name that
 * announces the unread count.
 *
 * One component rather than two identical compositions. The customer header
 * and the provider topbar each independently wrapped `NotificationBell` in a
 * `<Link aria-label={count > 0 ? tNotifications("unreadBadge", {count}) :
 * t("notifications")}>` — Task 13 already had a fix round because that
 * composition was wrong once (the badge's own `aria-label` was losing to the
 * link's, silently, for a screen-reader user tabbing to the bell). Two
 * copies of a sentence this fragile are two chances for it to drift again;
 * this is now the one place it is written.
 *
 * `useUnreadCount` runs once, here, and its result is passed into
 * `NotificationBell` as a `count` prop rather than the bell fetching it
 * again itself — the two calls shared a query key, so it was never two
 * different numbers, just the same one fetched twice.
 *
 * `to`, `params` and `className` are the caller's decision, not this
 * component's: the customer header's bare icon and the provider shell's
 * bordered 36px square are two different designs the caller still owns, not
 * something this extraction gets to flatten into one look.
 */
export function NotificationBellLink({
  scope,
  to,
  params,
  className,
}: {
  scope: InboxScope;
  to: string;
  params?: Record<string, string>;
  className?: string;
}) {
  const { t } = useTranslation("common");
  const { t: tNotifications } = useTranslation("notifications");
  const count = useUnreadCount(scope);

  return (
    <Link
      to={to}
      params={params}
      aria-label={count > 0 ? tNotifications("unreadBadge", { count }) : t("notifications")}
      className={className}
    >
      <NotificationBell count={count} />
    </Link>
  );
}
