import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { primaryItems, type ConsoleNav } from "@/shared/lib/console-nav";
import { useBottomEdgeOwned } from "@/shared/lib/console-bottom-edge";
import { useConsoleCounts } from "./console-counts";
import { useConsoleMenu } from "./console-menu-context";

export const CONSOLE_MENU_TRIGGER_ID = "console-menu-trigger";
export const CONSOLE_MENU_SHEET_ID = "console-menu-sheet";

const TAB =
  "flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium text-[var(--color-muted-foreground)]";
const BADGE =
  "absolute -top-1 left-1/2 ml-1 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--color-destructive)] px-1 text-[9px] font-bold leading-none text-white";

/**
 * The phone's navigation: the three items marked `primary`, and Menu.
 *
 * Below `md` only — from `md` the sidebar carries the same items. The three
 * are the ones that arrive with a count, trimmed to what a phone is good
 * for; editing a service is a seven-step wizard with image cropping, a desk
 * job, and it lives in the sheet.
 *
 * Renders nothing while a screen owns the bottom edge — a save bar, a
 * composer, a decision. One bar, and the task wins.
 *
 * In flow at the foot of the inset, not fixed over `main`: the inset is
 * already a fixed-height column in which only `main` scrolls, so the bar
 * takes its own room and the last card in a list can never end up under it.
 * `pb-[env(safe-area-inset-bottom)]` keeps it clear of the home indicator.
 */
export function ConsoleTabBar({ nav, slug }: { nav: ConsoleNav; slug: string | undefined }) {
  const { t } = useTranslation(nav.ns);
  const { t: tc } = useTranslation("common");
  const counts = useConsoleCounts();
  const { open, setOpen } = useConsoleMenu();
  const owned = useBottomEdgeOwned();
  if (owned) return null;

  return (
    <nav
      aria-label={tc("mainNavigation")}
      className="flex shrink-0 border-t border-sidebar-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {primaryItems(nav).map((item) => {
        const Icon = item.icon;
        const count = item.count ? counts[item.count] : undefined;
        return (
          <Link
            key={item.key}
            to={item.url}
            params={{ slug: slug ?? "" }}
            className={TAB}
            activeProps={{ className: "text-[var(--color-primary)]" }}
          >
            <span className="relative">
              <Icon className="h-5 w-5" aria-hidden="true" />
              {count ? <span className={BADGE}>{count}</span> : null}
            </span>
            {t(item.shortKey ?? item.titleKey)}
          </Link>
        );
      })}
      <button
        id={CONSOLE_MENU_TRIGGER_ID}
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls={CONSOLE_MENU_SHEET_ID}
        className={TAB}
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
        {tc("menu")}
      </button>
    </nav>
  );
}
