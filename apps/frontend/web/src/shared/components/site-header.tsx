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
    ? "text-sm font-semibold whitespace-nowrap text-[var(--color-headline)]"
    : "text-sm font-medium whitespace-nowrap text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]";
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
 * the icons went. There are three and only three: the provider's door lives
 * in the footer's Company column, and a day spent in this row proved why —
 * see the header test that now keeps it out.
 *
 * **The bar is centred in the window, and the middle track's width is what
 * centres it.** Two earlier versions both read as a centring that had
 * failed, and for the same reason: they centred the bar in the space left
 * over between the logo and the right-hand cluster, and those are 87px and
 * 403px, so the middle of what is left sits well left of the middle of the
 * screen.
 *
 * A bare `1fr` is `minmax(auto, 1fr)`: a track that cannot go below its own
 * content but takes an equal share of whatever is free. So the two outer
 * tracks come out the same width — and the bar exactly centred — for as long
 * as that equal share is at least the 403px the cluster needs. Which is a
 * sum: `shell − bar − 64px of gap ≥ 2 × 403`, and the shell is
 * `min(1320px, 100vw − 48px)`. Solve it for the bar and you get
 * `100vw − 918px`, capped at 450 where the shell stops growing.
 *
 * Hence `clamp(362px, calc(100vw - 918px), 450px)`. Measured: dead centre at
 * 768, 900, 1280, 1368, 1440, 1600 and 1920. The floor is what the band from
 * 1024 to 1279 costs — there the three destinations are showing and the
 * window is narrow, and exact centring would want a 234px field, so the bar
 * keeps 362px and sits left instead. A bar nobody can type in is worse than
 * a bar that is not quite centred.
 *
 * 450 rather than the 520 the bar had while it was anchored to the logo:
 * centring is bought with width, and that is the price. `minmax(0, …)` is a
 * maximum and not a floor, so the bar still gives way before either side
 * does — which is what keeps this honest in the languages whose three
 * destinations run wider than Portuguese's.
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
      {/* A wrapping flex below `md`, the three-column grid above it. On a
          phone the search takes a row of its own — a field between the logo
          and the account controls has about 90px to live in — and
          `order-last` plus `w-full` is what puts it there. One element moved
          by the layout, rather than a second copy rendered per breakpoint,
          which would put two searchboxes and two identical labels in the
          document on every page. */}
      <div className="page-shell flex flex-wrap items-center gap-x-4 gap-y-3 py-3.5 md:grid md:h-[84px] md:grid-cols-[1fr_minmax(0,clamp(362px,calc(100vw-918px),450px))_1fr] md:gap-x-6 md:py-0 lg:gap-x-8">
        <Link to="/" className="shrink-0 md:justify-self-start">
          {/* `max-w-none` undoes Tailwind's preflight, which caps every `img`
              at `max-width: 100%`. That cap makes the logo's min-content
              contribution nearly nothing, so the left track collapsed and
              scaled the wordmark down — 87px to 59px at a 1024px viewport —
              instead of the bar giving up the width it was told to give up.
              A logo that changes size with the window is not a logo. */}
          <img
            src={overlay ? "/brand/logo-white.svg" : "/brand/logo-primary.svg"}
            alt="Ntizo"
            className="h-7 max-w-none"
          />
        </Link>

        {/* `min-w-0` so the bar may shrink below its content's width. Without
            it the middle track refuses to give ground and the account
            controls are pushed off the right of the shell — which scrolls the
            whole page sideways, not just the header. */}
        <div className="order-last w-full min-w-0 md:order-none">
          <ServiceSearch {...search} className="w-full" />
        </div>

        {/* `ml-auto` is the phone's: it pushes the controls to the right of
            the logo on the first row. From `md` the grid places them, and
            `justify-self-end` holds them at the shell's right edge however
            wide the track around them turns out to be. */}
        <div className="ml-auto flex items-center gap-2 md:ml-0 md:justify-self-end lg:gap-3.5">
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

          {/* `whitespace-nowrap` on everything in this cluster, and it is
              load-bearing rather than cosmetic. The middle track is
              `minmax(0, 450px)` precisely so the bar gives way before either
              side does — but a track's floor is its *min-content*, and text
              that may wrap has a min-content of its longest word. Left to
              wrap, "Sign in" broke over two lines at 1024px while the bar
              stayed at its full 450, which is the cluster being squeezed
              instead of the thing that was meant to yield. */}
          <HeaderActions
            onDark={overlay}
            signedOutAction={
              <Link
                to="/sign-in"
                className={
                  overlay
                    ? "font-rounded rounded-full bg-white/95 px-5 py-2.5 text-sm font-bold whitespace-nowrap text-[#0e1f37]"
                    : "font-rounded rounded-full bg-[var(--color-primary)] px-5 py-2.5 text-sm font-bold whitespace-nowrap text-white"
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
