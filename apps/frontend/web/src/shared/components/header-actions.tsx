import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { useCurrentUser } from "@/features/user/viewmodel/use-current-user";
import { useUnreadCount } from "@/features/notifications/viewmodel/use-unread-count";
import { NotificationBell } from "@/features/notifications/ui/notification-bell";
import { LanguageSwitcher } from "@/shared/components/language-switcher";
import { UserMenu } from "@/shared/components/user-menu";

interface HeaderActionsProps {
  /**
   * Rendered in place of the account cluster when nobody is signed in.
   *
   * Passed in rather than built here so the landing page keeps its own
   * navy sign-in pill, which is styled against that page's palette rather
   * than the theme tokens the app zones use.
   */
  signedOutAction?: ReactNode;
  /**
   * Whether to render the bell and the account avatar.
   *
   * False in the provider and admin zones, where the shell already carries a
   * notifications button and the sidebar footer already carries an account
   * menu — one that also switches the active provider, which this one does
   * not. Rendering both would put two bells and two avatars on one screen.
   * Consolidating them is a real improvement, but it needs a home for
   * provider-switching first, so it is a separate decision rather than a
   * silent side effect of this header.
   */
  showAccount?: boolean;
  /**
   * Renders for a dark ground — the landing hero sits behind this header.
   * Only the two bare icon controls need it; the account chip carries its own
   * light pill either way.
   */
  onDark?: boolean;
}

/**
 * The bell link, and the count needed to announce it correctly.
 *
 * Its own component rather than a hook called at the top of `HeaderActions`:
 * this only ever mounts once `showAccount && user` are both true, in the
 * branch below. `useUnreadCount` has no auth gate of its own — it is
 * `enabled` whenever `scope.kind === "mine"`, which is always — so calling it
 * unconditionally from `HeaderActions` itself would fire the unread-count
 * query for every anonymous visitor too: the landing page, sign-in, sign-up.
 * Mounting it only inside the signed-in branch is what keeps that from
 * happening, the same way `NotificationBell`'s own internal call already did
 * before this component existed.
 *
 * The badge's own `aria-label` (the full "N unread notifications" sentence)
 * loses to this element's `aria-label` for the *link's* accessible name — an
 * element's own `aria-label` wins over its descendants' for that element,
 * per how accessible names are computed. So the count has to be composed
 * into this label directly; a screen-reader user tabbing to the bell would
 * otherwise hear "Notifications, link" and never the number.
 */
function NotificationBellLink({ onDark }: { onDark: boolean }) {
  const { t } = useTranslation("common");
  const { t: tNotifications } = useTranslation("notifications");
  const count = useUnreadCount({ kind: "mine" });

  return (
    <Link
      to="/account/notifications"
      aria-label={
        count > 0 ? tNotifications("unreadBadge", { count }) : t("notifications")
      }
      className={
        onDark
          ? "rounded-full p-2 text-white/90 hover:bg-white/15"
          : "rounded-full p-2 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
      }
    >
      <NotificationBell scope={{ kind: "mine" }} />
    </Link>
  );
}

/**
 * The right-hand side of the top bar, in every zone.
 *
 * It carried a Cliente|Prestador segmented switch until every zone had its own
 * navigation — a sidebar in the provider and admin zones, a top menu in the
 * customer one. A control that duplicates the navigation beside it is one more
 * thing to keep in step, and a second answer to a question the page already
 * answers.
 *
 * The signed-out action shows until a session is known, rather than the
 * header staying empty while the query is in flight. That order matters on
 * the landing page: it is public, server-rendered, and the server has no
 * session either — so waiting would blank the primary call to action for
 * every visitor on every cold load, to spare signed-in users one frame of
 * "Sign in" before their avatar arrives.
 */
export function HeaderActions({
  signedOutAction,
  showAccount = true,
  onDark = false,
}: HeaderActionsProps) {
  const { data: user } = useCurrentUser();

  return (
    <div className="flex items-center gap-2">
      <LanguageSwitcher
        className={onDark ? "text-white/90 hover:bg-white/15" : undefined}
      />
      {!showAccount ? null : user ? (
        <>
          <NotificationBellLink onDark={onDark} />
          <UserMenu />
        </>
      ) : (
        signedOutAction
      )}
    </div>
  );
}
