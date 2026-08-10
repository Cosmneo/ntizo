import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Bell } from "lucide-react";
import type { Zone } from "@/shared/lib/zones";
import { useCurrentUser } from "@/features/user/viewmodel/use-current-user";
import { ZoneSwitcher } from "@/shared/components/zone-switcher";
import { LanguageSwitcher } from "@/shared/components/language-switcher";
import { UserMenu } from "@/shared/components/user-menu";

interface HeaderActionsProps {
  currentZone: Zone;
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
 * The right-hand side of the top bar, in every zone.
 *
 * The signed-out action shows until a session is known, rather than the
 * header staying empty while the query is in flight. That order matters on
 * the landing page: it is public, server-rendered, and the server has no
 * session either — so waiting would blank the primary call to action for
 * every visitor on every cold load, to spare signed-in users one frame of
 * "Sign in" before their avatar arrives.
 */
export function HeaderActions({
  currentZone,
  signedOutAction,
  showAccount = true,
  onDark = false,
}: HeaderActionsProps) {
  const { t } = useTranslation("common");
  const { data: user } = useCurrentUser();

  return (
    <div className="flex items-center gap-2">
      {user ? <ZoneSwitcher current={currentZone} /> : null}
      <LanguageSwitcher
        className={onDark ? "text-white/90 hover:bg-white/15" : undefined}
      />
      {!showAccount ? null : user ? (
        <>
          {/* Inert until notifications exist. Kept because the header's
              shape was designed around it; it opens nothing today. */}
          <button
            type="button"
            aria-label={t("notifications")}
            className={
              onDark
                ? "rounded-full p-2 text-white/90 hover:bg-white/15"
                : "rounded-full p-2 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
            }
          >
            <Bell className="h-5 w-5" />
          </button>
          <UserMenu />
        </>
      ) : (
        signedOutAction
      )}
    </div>
  );
}
