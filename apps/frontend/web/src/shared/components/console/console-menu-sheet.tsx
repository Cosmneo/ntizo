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
import { CONSOLE_MENU_SHEET_ID, CONSOLE_MENU_TRIGGER_ID } from "./console-tab-bar";
import type { ConsoleNav, ConsoleNavItem } from "@/shared/lib/console-nav";

const ITEM =
  "flex items-center gap-2.5 rounded-[var(--radius-field)] px-2.5 py-2.5 text-[15px] font-medium text-[var(--color-foreground)]";
const ITEM_ACTIVE = "bg-[var(--color-muted)] text-[var(--color-primary)]";
const GROUP = "px-2.5 pt-3 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]";
const FOCUSABLE = 'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Keep Tab inside the sheet while it is open. */
function trapTab(e: KeyboardEvent, container: HTMLElement) {
  const nodes = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
  if (nodes.length === 0) return;
  const first = nodes[0]!;
  const last = nodes[nodes.length - 1]!;
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

/**
 * The sidebar, as a bottom sheet.
 *
 * Same groups, same order, same icons, same badges — read from the same
 * `ConsoleNav` the sidebar reads. One description, three renderings. It
 * reuses `Sheet` from the UI package, which already wrapped the old
 * left-hand drawer: a change of side and content, not a new primitive.
 *
 * Closes on the backdrop, on Escape, and on navigating; traps focus while
 * open and hands it back to the Menu tab on close. The account actions are
 * at its foot because the sidebar's account menu is not reachable on a phone.
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
  const panelRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLAnchorElement>(null);

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

  // Focus in on open; Escape and Tab while open; focus back out on close.
  useEffect(() => {
    if (!open) return;
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      else if (e.key === "Tab" && panelRef.current) trapTab(e, panelRef.current);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.getElementById(CONSOLE_MENU_TRIGGER_ID)?.focus();
    };
  }, [open, setOpen]);

  async function handleSignOut() {
    const { serverRevokeFailed } = await signOut();
    if (serverRevokeFailed) toast.error(ta("signOutOffline"));
  }

  function item(entry: ConsoleNavItem, first = false) {
    const Icon = entry.icon;
    const count = entry.count ? counts[entry.count] : undefined;
    return (
      <Link
        key={entry.key}
        ref={first ? firstRef : undefined}
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
        className="max-h-[84svh] overflow-y-auto rounded-t-2xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <div ref={panelRef} id={CONSOLE_MENU_SHEET_ID} role="dialog" aria-modal="true" aria-label={tc("menu")}>
          <div aria-hidden="true" className="mx-auto mb-3 h-1 w-9 rounded-full bg-[var(--color-border)]" />
          <p className="px-2.5 pb-2 text-xs text-[var(--color-muted-foreground)]">{zoneLabel}</p>
          {header}

          {item(nav.home, true)}
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
