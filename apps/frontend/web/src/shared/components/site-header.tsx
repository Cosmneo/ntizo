import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { HeaderActions } from "@/shared/components/header-actions";
import { PUBLIC_NAV } from "@/shared/lib/public-nav";

/**
 * The header every public page wears.
 *
 * Two grounds, one structure. `overlay` puts it on top of the landing hero's
 * artwork — transparent, white logo, white controls; without it, it sits on
 * the page as a solid bar with the primary logo. The alternative was a header
 * per page, which is how the directory ended up with none at all: a public
 * page linked from the landing, with no way back and no account menu.
 *
 * Three columns rather than a flex row with `mx-auto` on the nav: that centres
 * the pill in the space left between the logo and the actions, which are
 * different widths — and the right one changes width with the signed-in user's
 * name, so the pill moved depending on who was looking at it.
 */
export function SiteHeader({
  overlay = false,
  current = "explore",
}: {
  overlay?: boolean;
  current?: "explore" | "categories" | "providers";
}) {
  const { t } = useTranslation("landing");

  return (
    <header
      className={
        overlay
          ? "absolute inset-x-0 top-0 z-20"
          : "sticky top-0 z-20 border-b border-[var(--color-border)] bg-[var(--color-background)]"
      }
    >
      <div className="page-shell grid h-[84px] grid-cols-[1fr_auto_1fr] items-center gap-4">
        <Link to="/" className="justify-self-start">
          <img
            src={overlay ? "/brand/logo-white.svg" : "/brand/logo-primary.svg"}
            alt="Ntizo"
            className="h-8"
          />
        </Link>

        <nav
          className={
            overlay
              ? "hidden justify-self-center gap-0.5 rounded-full bg-white/95 p-1 shadow-sm lg:flex"
              : "hidden justify-self-center gap-0.5 rounded-full bg-[var(--color-muted)] p-1 lg:flex"
          }
        >
          {PUBLIC_NAV.map((item) => {
            const Icon = item.icon;
            const active = item.key.endsWith(current);
            return (
              <Link
                key={item.key}
                to={item.to}
                className={
                  active
                    ? "flex items-center gap-1.5 rounded-full bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white"
                    : "flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                }
              >
                <Icon className="h-4 w-4" />
                {t(item.key)}
              </Link>
            );
          })}
        </nav>

        <div className="col-start-3 justify-self-end">
          <HeaderActions
            onDark={overlay}
            signedOutAction={
              <Link
                to="/sign-in"
                className={
                  overlay
                    ? "font-rounded rounded-full bg-white/95 px-5 py-2.5 text-sm font-bold text-[#0e1f37]"
                    : "font-rounded rounded-full bg-[var(--color-primary)] px-5 py-2.5 text-sm font-bold text-white"
                }
              >
                {t("signIn")}
              </Link>
            }
          />
        </div>
      </div>
    </header>
  );
}
