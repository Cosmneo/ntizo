import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Compass, Globe, User, Users } from "lucide-react";
import { cn } from "@ntizo/frontend-ui";
import { LanguageDialog } from "@/shared/components/language-switcher";
import { useCurrentUser } from "@/features/user/viewmodel/use-current-user";

/**
 * The fixed bottom bar on phones.
 *
 * Four destinations that all exist today. It is tempting to put Bookings and
 * Messages here — that is where they will end up — but a bottom bar is the
 * most prominent navigation on the device, and two of its four buttons
 * leading to empty pages would make the whole product feel unfinished.
 *
 * Hidden from `md` up, where the header carries the same things with room to
 * spare. Rendered once, by the root layout, so every page gets it.
 */
export function MobileNav() {
  const { t } = useTranslation("common");
  const { data: user } = useCurrentUser();
  const [languageOpen, setLanguageOpen] = useState(false);

  const itemClass =
    "flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium text-[var(--color-muted-foreground)]";

  return (
    <>
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
        <Link
          to="/"
          className={itemClass}
          activeProps={{ className: "text-[var(--color-primary)]" }}
          activeOptions={{ exact: true }}
        >
          <Compass className="h-5 w-5" />
          {t("navExplore")}
        </Link>

        <Link
          to="/providers"
          className={itemClass}
          activeProps={{ className: "text-[var(--color-primary)]" }}
        >
          <Users className="h-5 w-5" />
          {t("zoneProvider")}
        </Link>

        <button type="button" onClick={() => setLanguageOpen(true)} className={itemClass}>
          <Globe className="h-5 w-5" />
          {t("language")}
        </button>

        {/* Signed out, this is the way in — the header's sign-in button is
            off-screen behind the logo row on a phone. */}
        <Link
          to={user ? "/account" : "/sign-in"}
          className={itemClass}
          activeProps={{ className: "text-[var(--color-primary)]" }}
        >
          <User className="h-5 w-5" />
          {t("navProfile")}
        </Link>
      </nav>

      <LanguageDialog open={languageOpen} onOpenChange={setLanguageOpen} />
    </>
  );
}
