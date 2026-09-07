import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { cn } from "@ntizo/frontend-ui";
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
 *
 * A variant, not a second header. `search` swaps the centre pill for the
 * browse pages' `SearchPill` and moves the three destinations to the right, as
 * plain text links ahead of the account cluster — the pill's own width made
 * no room for a 600px search beside it. Left absent, every one of the eight
 * pages that already import this component gets exactly what they get today.
 *
 * That variant is two rows on a phone: the logo and the account cluster on
 * one, the search across the full width of the next. Three things in one row
 * at 390px left the search column 0px wide, and the search is the only way a
 * phone reader can ask the browse pages anything.
 */
export function SiteHeader({
  overlay = false,
  current = "explore",
  search,
}: {
  overlay?: boolean;
  /**
   * Which pill is lit. `"none"` for pages outside the three destinations —
   * the company pages — so the header does not claim they are "Explore".
   * `endsWith("none")` matches no nav key, which is the whole mechanism.
   */
  current?: "explore" | "categories" | "services" | "providers" | "none";
  /**
   * The browse pages' search, drawn in the centre column in place of the nav
   * pill. A variant rather than a second header: eight surfaces import this
   * one, and the landing page keeps its own hero search.
   */
  search?: ReactNode;
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
      {/* minmax(0,1fr), not 1fr. A bare `1fr` is minmax(auto,1fr): its minimum
          is the content's own width, so the actions column refused to shrink
          and pushed the header past the viewport — which scrolls the whole
          page sideways, not just the header. Measured at a 180px viewport:
          155px of actions inside a 132px shell. */}
      <div
        className={
          search
            ? "page-shell grid h-auto grid-cols-[auto_minmax(0,1fr)_auto] grid-rows-[auto_auto] items-center gap-2 py-2 sm:gap-4 md:h-[84px] md:grid-rows-none md:py-0"
            : "page-shell grid h-[84px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-4"
        }
      >
        <Link to="/" className="justify-self-start">
          <img
            src={overlay ? "/brand/logo-white.svg" : "/brand/logo-primary.svg"}
            alt="Ntizo"
            className="h-7"
          />
        </Link>

        {search ? (
          /* Below `md` the search is its own full-width row under the logo bar,
             not the middle column: sharing the row with the logo and the
             account cluster left it 0px wide on a 390px screen and the reader
             had no way to search at all. From `md` it goes back into column
             two, where the 600px pill has room. */
          <div className="col-span-3 row-start-2 flex min-w-0 items-center justify-center md:col-span-1 md:row-start-auto">
            {search}
          </div>
        ) : (
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
        )}

        <div
          className={
            search
              ? "col-start-3 flex items-center justify-self-end gap-6"
              : "col-start-3 justify-self-end"
          }
        >
          {/* The pill's destinations minus "Explore": the logo already goes
              home, and a text link repeating that would be a second one right
              beside it.

              `hidden lg:inline` is the breakpoint the nav pill these replace
              already used (`hidden … lg:flex`), and `MobileNav` carries the
              same destinations at the bottom of every narrow screen. Left
              visible they took the whole header row from the search. */}
          {search &&
            PUBLIC_NAV.slice(1).map((item) => {
              const active = item.key.endsWith(current);
              return (
                <Link
                  key={item.key}
                  to={item.to}
                  className={
                    active
                      ? "hidden text-sm font-bold text-[var(--color-headline)] lg:inline"
                      : "hidden text-sm font-medium text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] lg:inline"
                  }
                >
                  {t(item.key)}
                </Link>
              );
            })}

          <HeaderActions
            onDark={overlay}
            signedOutAction={
              <Link
                to="/sign-in"
                className={cn(
                  overlay
                    ? "font-rounded rounded-full bg-white/95 px-5 py-2.5 text-sm font-bold text-[#0e1f37]"
                    : "font-rounded rounded-full bg-[var(--color-primary)] px-5 py-2.5 text-sm font-bold text-white",
                  // Only the search variant crowds this column, and only there
                  // did "Sign in" break across two lines. The other eight
                  // callers keep the class list they had.
                  search && "whitespace-nowrap",
                )}
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
