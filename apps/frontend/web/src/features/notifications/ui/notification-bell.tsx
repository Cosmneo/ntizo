import { useTranslation } from "react-i18next";
import { Bell } from "lucide-react";
import { cn } from "@ntizo/frontend-ui";
import { useUnreadCount } from "@/features/notifications/viewmodel/use-unread-count";
import type { InboxScope } from "@/features/notifications/viewmodel/use-inbox";

/** Above this the badge stops counting and just says "a lot". */
const BADGE_CAP = 99;

/**
 * The bell icon and its unread badge — undressed of the button or link around
 * it. The customer header and the provider topbar each style that control
 * differently (a bare icon versus a bordered square), so only the part both
 * share lives here; the caller supplies the click target and its own
 * accessible name for what activating it does.
 *
 * The badge's accessible name is the full sentence (`t("unreadBadge", …)`),
 * not the bare digit it displays: a screen reader hears "5 unread
 * notifications", not "5".
 */
export function NotificationBell({
  scope,
  className,
}: {
  scope: InboxScope;
  className?: string;
}) {
  const { t } = useTranslation("notifications");
  const count = useUnreadCount(scope);

  return (
    <span className={cn("relative inline-flex", className)}>
      <Bell aria-hidden="true" className="h-5 w-5" />
      {count > 0 && (
        <span
          aria-label={t("unreadBadge", { count })}
          className="absolute -top-1.5 -right-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--color-primary)] px-1 text-[10px] leading-none font-semibold text-white"
        >
          {count > BADGE_CAP ? `${BADGE_CAP}+` : count}
        </span>
      )}
    </span>
  );
}
