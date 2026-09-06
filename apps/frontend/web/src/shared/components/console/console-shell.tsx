import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SidebarInset, SidebarProvider, useIsMobile } from "@ntizo/frontend-ui";
import { NotificationBellLink } from "@/shared/components/notification-bell-link";
import { useActiveProvider } from "@/features/provider/viewmodel/use-active-provider";
import { useProviderDetail } from "@/features/provider/viewmodel/use-providers";
import { formatCommission } from "@/shared/domain/commission-format";
import { BottomEdgeProvider } from "@/shared/lib/console-bottom-edge";
import { consoleNav, type ConsoleNav, type ConsoleZone } from "@/shared/lib/console-nav";
import { useIsTablet } from "@/shared/hooks/use-is-tablet";
import { PageHeaderContext, type PageHeaderState } from "@/shared/lib/page-header";
import { ConsoleCountsProvider } from "./console-counts";
import { ConsoleHeader } from "./console-header";
import { ConsoleMenuProvider } from "./console-menu-context";
import { ConsoleMenuSheet } from "./console-menu-sheet";
import { ConsoleSidebar } from "./console-sidebar";
import { ConsoleStrip } from "./console-strip";
import { ConsoleTabBar } from "./console-tab-bar";
import { MobileWorkspaceSwitcher, WorkspaceSwitcher } from "./workspace-switcher";

/**
 * The bordered square the bell sits in. 44px on a phone — where it is the
 * only route to the inbox, and the only control in this header a thumb has
 * to hit — and the designed 36px from `md` up, beside the trigger.
 */
const BELL_CLASS =
  "relative inline-flex h-11 w-11 items-center justify-center rounded-md border border-input bg-secondary text-foreground hover:bg-accent md:h-9 md:w-9";

/**
 * The console: one shell for `/provider/$slug/*` and `/admin/*`.
 *
 * It replaces `ProviderShell` and `AdminShell`, which were the same header
 * and the same context written twice and had already drifted. The zone
 * decides three things — the nav data, the masthead label, and whether the
 * strip row carries workspace facts — and each zone reads only its own data:
 * `WorkspaceShell` and `PlatformShell` call different hooks and render one
 * `ShellFrame`. Nothing in the frame knows which zone it is in.
 */
export function ConsoleShell({ zone, children }: { zone: ConsoleZone; children: ReactNode }) {
  const [header, setHeader] = useState<PageHeaderState>({ title: "" });
  const [action, setAction] = useState<ReactNode>(null);
  // Stable identity so consumers don't re-render on every shell render.
  const headerCtx = useMemo(() => ({ header, setHeader, action, setAction }), [header, action]);

  const nav = consoleNav(zone);

  return (
    <PageHeaderContext.Provider value={headerCtx}>
      <BottomEdgeProvider>
        <ConsoleMenuProvider>
          {zone === "workspace" ? (
            <WorkspaceShell nav={nav}>{children}</WorkspaceShell>
          ) : (
            <PlatformShell nav={nav}>{children}</PlatformShell>
          )}
        </ConsoleMenuProvider>
      </BottomEdgeProvider>
    </PageHeaderContext.Provider>
  );
}

/**
 * The workspace's data: which one is active, its slug, its commission, its
 * status. Read here, in the one component every `/provider/$slug` route
 * renders through — a bookmark straight to `/services/new` never passes
 * through Overview, and both the rate and the not-live sentence have to be
 * true on every door.
 */
function WorkspaceShell({ nav, children }: { nav: ConsoleNav; children: ReactNode }) {
  const { t, i18n } = useTranslation("provider");
  const { activeProvider } = useActiveProvider();
  const providerId = activeProvider?.id ?? "";
  const { data: detail } = useProviderDetail(activeProvider?.id);
  const commission =
    detail?.commissionBps == null
      ? null
      : formatCommission(detail.commissionBps, i18n.resolvedLanguage ?? i18n.language);

  return (
    <ConsoleCountsProvider zone="workspace" providerId={providerId}>
      <ShellFrame
        nav={nav}
        slug={activeProvider?.slug}
        zoneLabel={t("providerConsole")}
        bell={
          // The workspace's own inbox, not the person's. `useUnreadCount`'s
          // `enabled` guard keeps it from firing while `providerId` is "".
          <NotificationBellLink
            scope={{ kind: "provider", providerId }}
            to="/provider/$slug/notifications"
            params={{ slug: activeProvider?.slug ?? "" }}
            className={BELL_CLASS}
          />
        }
        strip={activeProvider ? <ConsoleStrip status={activeProvider.status} commission={commission} /> : null}
        workspaceMenu={<WorkspaceSwitcher />}
        sheetHeader={<MobileWorkspaceSwitcher />}
      >
        {children}
      </ShellFrame>
    </ConsoleCountsProvider>
  );
}

/** The platform has no workspace: no strip, no switcher, the person's own inbox. */
function PlatformShell({ nav, children }: { nav: ConsoleNav; children: ReactNode }) {
  const { t } = useTranslation("admin");
  return (
    <ConsoleCountsProvider zone="platform">
      <ShellFrame
        nav={nav}
        slug={undefined}
        zoneLabel={t("adminConsole")}
        bell={<NotificationBellLink scope={{ kind: "mine" }} to="/account/notifications" className={BELL_CLASS} />}
        strip={null}
      >
        {children}
      </ShellFrame>
    </ConsoleCountsProvider>
  );
}

/**
 * The frame both zones render. The inset holds the viewport; only `main`
 * scrolls — before this the whole document scrolled and the navigation slid
 * away exactly when a long page made it useful.
 */
function ShellFrame({
  nav,
  slug,
  zoneLabel,
  bell,
  strip,
  workspaceMenu,
  sheetHeader,
  children,
}: {
  nav: ConsoleNav;
  slug: string | undefined;
  zoneLabel: string;
  bell: ReactNode;
  strip: ReactNode;
  workspaceMenu?: ReactNode;
  sheetHeader?: ReactNode;
  children: ReactNode;
}) {
  // Between md and lg the sidebar starts as its icon rail; the person can
  // still expand it, and that choice survives — `defaultOpen` is read once.
  const isTablet = useIsTablet();
  const isMobile = useIsMobile();
  return (
    <SidebarProvider defaultOpen={!isTablet}>
      {/* Below `md` there is no sidebar — the bar and the sheet are the
          navigation. Not rendered rather than hidden: `SidebarProvider`'s
          ⌘B shortcut would otherwise open the primitive's own left-hand
          drawer, the model the spec rejected, on any window under 768px. */}
      {!isMobile && (
        <ConsoleSidebar nav={nav} slug={slug} zoneLabel={zoneLabel} workspaceMenu={workspaceMenu} />
      )}
      <SidebarInset className="h-svh min-h-0 overflow-hidden">
        <ConsoleHeader bell={bell} />
        {strip}
        <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
        <ConsoleTabBar nav={nav} slug={slug} />
        <ConsoleMenuSheet nav={nav} slug={slug} zoneLabel={zoneLabel} header={sheetHeader} />
      </SidebarInset>
    </SidebarProvider>
  );
}
