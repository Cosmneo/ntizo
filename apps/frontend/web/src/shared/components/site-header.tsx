import type { ComponentProps } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { HeaderActions } from "@/shared/components/header-actions";
import { ServiceSearch } from "@/shared/components/service-search";
import { PUBLIC_NAV } from "@/shared/lib/public-nav";

/**
 * A destination in the header: text, and nothing else.
 *
 * It was a pill group until 7 September 2026 — a muted capsule, an icon per
 * item, and the lit one filled with the site's blue. Beside the search bar
 * that is two enclosed shapes competing at the same size, and the blue read
 * as the page's primary action when the primary action is the search's own
 * button. Weight and colour carry the current page instead, which is all the
 * pill was ever saying.
 *
 * The icons went with the capsule. They were legible at pill size and are
 * noise beside bare words; the phone's bottom bar still draws them, where a
 * tab target wants a glyph and the labels are 10px.
 *
 * Navy rather than the blue for the lit one: `--color-headline` is what this
 * site makes things important with, and it leaves the blue meaning "this is
 * the button you press".
 */
function navLinkClassName(active: boolean, overlay: boolean): string {
  if (overlay) {
    return active
      ? "text-sm font-semibold text-white"
      : "text-sm font-medium text-white/70 hover:text-white";
  }
  return active
    ? "text-sm font-semibold text-[var(--color-headline)]"
    : "text-sm font-medium text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]";
}

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
 * The three destinations moved to the right in the same change. They sit
 * beside the account controls rather than in a column of their own: two
 * clusters and a field reads as a bar, where three separated groups read as
 * three. They are bare text — see `navLinkClassName` for why the capsule and
 * the icons went.
 *
 * **The bar hugs the logo. It is not centred, and does not pretend to be.**
 * It was centred in the space left between the logo and the right-hand
 * cluster, which is not the centre of the window — the logo is ~110px and
 * the cluster ~420px, so the midpoint of what is left sits well to the left
 * of the midpoint of the screen, and it read as a centring that had failed
 * (7 September 2026).
 *
 * True window-centring is not available at the widths this site is read at.
 * It takes equal outer columns, so both become the ~420px the cluster needs:
 * 420px of field at 1440, and at 1024 the arithmetic leaves under 100px,
 * which means either a field nobody can type in or dropping the destinations
 * below 1280. Anchored to the logo it is the same distance from the same
 * thing at every width, keeps its full 520px, and the free space collects
 * where free space is harmless — between the bar and the cluster.
 */
export function SiteHeader({
  overlay = false,
  current = "explore",
  search = {},
}: {
  overlay?: boolean;
  /**
   * Which destination is lit. `"none"` for pages outside the three — the
   * company pages — so the header does not claim they are "Explore".
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
        <div className="order-last w-full md:order-none md:w-auto md:min-w-0 md:max-w-[520px] md:flex-1">
          <ServiceSearch {...search} className="w-full" />
        </div>

        {/* `ml-auto` at every width, which is what anchors the bar to the logo:
            the cluster takes all the slack, so the bar starts at the same
            place whatever is on the right of it — a signed-in avatar, a
            "Sign in" pill, or a name of any length. */}
        <div className="ml-auto flex items-center gap-2 lg:gap-3.5">
          <nav className="hidden items-center gap-6 lg:flex">
            {PUBLIC_NAV.map((item) => (
              <Link
                key={item.key}
                to={item.to}
                className={navLinkClassName(item.key.endsWith(current), overlay)}
              >
                {t(item.key)}
              </Link>
            ))}
          </nav>

          {/* Only where the nav is. Below `lg` the cluster is the account
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
