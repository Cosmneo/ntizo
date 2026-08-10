import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { User } from "lucide-react";
import { cn } from "@ntizo/frontend-ui";
import { useCurrentUser } from "@/features/user/viewmodel/use-current-user";
import { PUBLIC_NAV } from "@/shared/lib/public-nav";

/**
 * The fixed bottom bar on phones.
 *
 * The same three destinations the header's pill carries, plus the account —
 * read from one list, so the two navigations cannot drift apart.
 *
 * Language used to sit in the fourth slot and does not any more. A bottom bar
 * is the most prominent navigation on the device and holds four things; giving
 * one of those four to a setting most people change once, if ever, cost the
 * profile its place. Language is still in the header on every page and in
 * Preferences, which is where a setting belongs.
 *
 * Hidden from `md` up, where the header carries the same things with room to
 * spare. Rendered once, by the root layout, so every page gets it.
 */
export function MobileNav() {
  const { t } = useTranslation("common");
  const { data: user } = useCurrentUser();

  const itemClass =
    "flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium text-[var(--color-muted-foreground)]";
  const activeProps = { className: "text-[var(--color-primary)]" };

  return (
    <nav
      aria-label={t("mainNavigation")}
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 flex md:hidden",
        "border-t border-[var(--color-border)] bg-[var(--color-background)]",
        // Keeps the buttons clear of the iOS home indicator, which otherwise
        // sits on top of the rightmost one.
        "pb-[env(safe-area-inset-bottom)]",
      )}
    >
      {PUBLIC_NAV.map(({ key, to, icon: Icon }) => (
        <Link
          key={key}
          to={to}
          className={itemClass}
          activeProps={activeProps}
          // Only the home link needs it. Without `exact`, "/" matches every
          // route and the first tab stays lit wherever the user is.
          activeOptions={to === "/" ? { exact: true } : undefined}
        >
          <Icon className="h-5 w-5" />
          {t(key)}
        </Link>
      ))}

      {/* Signed out, this is the way in — the header's sign-in button is
          off-screen behind the logo row on a phone. */}
      <Link
        to={user ? "/account" : "/sign-in"}
        className={itemClass}
        activeProps={activeProps}
      >
        <User className="h-5 w-5" />
        {t("navProfile")}
      </Link>
    </nav>
  );
}
