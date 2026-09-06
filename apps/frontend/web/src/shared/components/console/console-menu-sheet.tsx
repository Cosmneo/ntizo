import { useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, LogOut, User as UserIcon } from "lucide-react";
import { Button, Sheet, SheetContent, cn, useIsMobile } from "@ntizo/frontend-ui";
import { useSignOut } from "@/features/user/viewmodel/use-sign-out";
import { CONSOLE_BADGE } from "./console-badge";
import { useConsoleCounts } from "./console-counts";
import { useConsoleMenu } from "./console-menu-context";
import { CONSOLE_MENU_SHEET_ID } from "./console-tab-bar";
import type { ConsoleNav, ConsoleNavItem } from "@/shared/lib/console-nav";

const ITEM =
  "flex items-center gap-2.5 rounded-[var(--radius-field)] px-2.5 py-2.5 text-[15px] font-medium text-[var(--color-foreground)]";
const ITEM_ACTIVE = "bg-[var(--color-muted)] text-[var(--color-primary)]";
const GROUP = "px-2.5 pt-3 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]";
/** The visually-hidden heading that names the primitive's dialog. */
const CONSOLE_MENU_TITLE_ID = "console-menu-title";

/**
 * The sidebar, as a bottom sheet.
 *
 * Same groups, same order, same icons, same badges — read from the same
 * `ConsoleNav` the sidebar reads. One description, three renderings. It
 * reuses `Sheet` from the UI package: a change of side and content, not a
 * new primitive.
 *
 * `SheetContent` is the modal dialog — it owns the role, Escape, the Tab
 * trap, focus in on open and focus back to the Menu tab on close. Nothing
 * here duplicates any of that: a second Escape handler closes twice, and a
 * dialog inside a dialog is announced twice. What this component adds is
 * the dialog's name, closing on navigate, and closing when the phone
 * rotates past `md`. The account actions are at its foot because the
 * sidebar's account menu is not reachable on a phone.
 */
export function ConsoleMenuSheet({
  nav,
  slug,
  zoneLabel,
  header,
}: {
  nav: ConsoleNav;
  slug: string | undefined;
  zoneLabel: string;
  /** The zone's own head for the sheet — the workspace switcher. */
  header?: ReactNode;
}) {
  const { t } = useTranslation(nav.ns);
  const { t: tc } = useTranslation("common");
  const { t: ta } = useTranslation("auth");
  const { open, setOpen } = useConsoleMenu();
  const counts = useConsoleCounts();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const signOut = useSignOut();

  // Closes on navigate — the destination was the point of opening it.
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    setOpen(false);
  }, [pathname, setOpen]);

  // A phone rotated to landscape can cross `md` with the sheet open; the
  // panel would hide and its backdrop would not.
  const isMobile = useIsMobile();
  useEffect(() => {
    if (!isMobile) setOpen(false);
  }, [isMobile, setOpen]);

  async function handleSignOut() {
    const { serverRevokeFailed } = await signOut();
    if (serverRevokeFailed) toast.error(ta("signOutOffline"));
  }

  function item(entry: ConsoleNavItem) {
    const Icon = entry.icon;
    const count = entry.count ? counts[entry.count] : undefined;
    return (
      <Link
        key={entry.key}
        to={entry.url}
        params={{ slug: slug ?? "" }}
        className={ITEM}
        activeProps={{ className: cn(ITEM, ITEM_ACTIVE) }}
        onClick={() => setOpen(false)}
      >
        <Icon className="h-[18px] w-[18px] text-[var(--color-muted-foreground)]" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{t(entry.titleKey)}</span>
        {count ? <span className={CONSOLE_BADGE}>{count}</span> : null}
      </Link>
    );
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="bottom"
        labelledBy={CONSOLE_MENU_TITLE_ID}
        className="max-h-[84svh] overflow-y-auto rounded-t-2xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        {/* The id is what the Menu tab's `aria-controls` points at; the
            dialog role and its name belong to `SheetContent` above. */}
        <div id={CONSOLE_MENU_SHEET_ID}>
          <h2 id={CONSOLE_MENU_TITLE_ID} className="sr-only">
            {tc("menu")}
          </h2>
          <div aria-hidden="true" className="mx-auto mb-3 h-1 w-9 rounded-full bg-[var(--color-border)]" />
          <p className="px-2.5 pb-2 text-xs text-[var(--color-muted-foreground)]">{zoneLabel}</p>
          {header}

          {item(nav.home)}
          <p className={GROUP}>{t("nav.work")}</p>
          <div className="grid grid-cols-2 gap-x-2">{nav.work.map((entry) => item(entry))}</div>
          <p className={GROUP}>{t("nav.manage")}</p>
          <div className="grid grid-cols-2 gap-x-2">{nav.manage.map((entry) => item(entry))}</div>

          <div className="mt-3 flex gap-2 border-t border-[var(--color-border)] pt-3">
            <Button type="button" variant="outline" className="flex-1" onClick={() => navigate({ to: "/account" })}>
              <UserIcon className="h-4 w-4" />
              {t("nav.myAccount")}
            </Button>
            <Button type="button" variant="outline" className="flex-1" onClick={() => navigate({ to: "/" })}>
              <ArrowLeft className="h-4 w-4" />
              {t("backToApp")}
            </Button>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="mt-2 w-full text-[var(--color-destructive)]"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4" />
            {ta("signOut")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
