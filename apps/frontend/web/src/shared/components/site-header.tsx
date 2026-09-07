import type { ComponentProps } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { HeaderActions } from "@/shared/components/header-actions";
import { ServiceSearch } from "@/shared/components/service-search";
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
 * **The search lives here, not on the pages.** It used to be drawn three
 * times — the landing hero's big field, and a 760px band under the header on
 * each of the two browse pages — which meant a reader who wanted a different
 * service had to be on one of those three pages to ask for it. One bar, in
 * the one place that is on every screen, and the pages below it are free to
 * begin with their own content.
 *
 * The nav pill moved to the right in the same change, because the centre is
 * the search's now. It sits beside the account controls rather than in a
 * column of its own: two clusters and a field reads as a bar, where three
 * separated groups read as three.
 *
 * The search is centred in the space left between the logo and that cluster
 * — not in the window. Window-centring is what the old three-column grid
 * bought, and it is no longer purchasable: the right-hand cluster is ~540px
 * wide with the pill in it, and the equal outer columns it would take leave
 * under 300px in the middle at any width this site is read at.
 */
export function SiteHeader({
  overlay = false,
  current = "explore",
  search = {},
}: {
  overlay?: boolean;
  /**
   * Which pill is lit. `"none"` for pages outside the three destinations —
   * the company pages — so the header does not claim they are "Explore".
   * `endsWith("none")` matches no nav key, which is the whole mechanism.
   */
  current?: "explore" | "categories" | "services" | "providers" | "none";
  /**
   * What the bar asks for and what a submit does with it.
   *
   * Passed straight through to `ServiceSearch` rather than re-declared as
   * four props here, which keeps that component's rule that `to`,
   * `placeholder`, `label` and `search` arrive together or not at all — each
   * one alone is a bug it has already shipped.
   *
   * Omitted is the landing hero's behaviour: ask for a service, and a submit
   * starts a fresh search. A list page passes its own so that a typed term
   * keeps the category, the filters, the city and the sort underneath it.
   */
  search?: ComponentProps<typeof ServiceSearch>;
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
      {/* Wrapping flex, not a grid: the search takes a row of its own on a
          phone, where a field between the logo and the account controls has
          about 90px to live in. `order-last` plus `w-full` is what puts it
          there — one element moved by the layout, rather than a second copy
          rendered per breakpoint, which would put two searchboxes and two
          identical labels in the document on every page. */}
      <div className="page-shell flex flex-wrap items-center gap-x-4 gap-y-3 py-3.5 md:h-[84px] md:flex-nowrap md:gap-x-6 md:py-0 lg:gap-x-8">
        <Link to="/" className="shrink-0">
          <img
            src={overlay ? "/brand/logo-white.svg" : "/brand/logo-primary.svg"}
            alt="Ntizo"
            className="h-7"
          />
        </Link>

        {/* `min-w-0` on the flex child. A flex item's minimum is its content's
            width by default, so without this the bar refused to shrink and
            pushed the account controls off the right of the shell — which
            scrolls the whole page sideways, not just the header. */}
        <div className="order-last w-full md:order-none md:w-auto md:min-w-0 md:flex-1">
          <ServiceSearch {...search} className="w-full md:mx-auto md:max-w-[520px]" />
        </div>

        <div className="ml-auto flex items-center gap-2 md:ml-0 lg:gap-3.5">
          <nav
            className={
              overlay
                ? "hidden gap-0.5 rounded-full bg-white/95 p-1 shadow-sm lg:flex"
                : "hidden gap-0.5 rounded-full bg-[var(--color-muted)] p-1 lg:flex"
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

          {/* Only where the pill is. Below `lg` the cluster is the account
              controls alone, and a rule with nothing on one side of it. */}
          <span
            aria-hidden="true"
            className={
              overlay
                ? "hidden h-6 w-px bg-white/30 lg:block"
                : "hidden h-6 w-px bg-[var(--color-border)] lg:block"
            }
          />

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
