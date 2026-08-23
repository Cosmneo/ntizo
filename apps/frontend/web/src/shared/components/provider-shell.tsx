import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";
import {
  Separator,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@ntizo/frontend-ui";
import { AppSidebar } from "@/shared/components/app-sidebar/app-sidebar";
import { HeaderActions } from "@/shared/components/header-actions";
import { useActiveProvider } from "@/features/provider/viewmodel/use-active-provider";
import { useUnreadCount } from "@/features/notifications/viewmodel/use-unread-count";
import { NotificationBell } from "@/features/notifications/ui/notification-bell";
import {
  PageHeaderContext,
  type PageHeaderState,
} from "@/shared/lib/page-header";
import { applyThemePreference, readThemePreference } from "@/shared/lib/theme";

export function ProviderShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation("common");
  const { t: tNotifications } = useTranslation("notifications");
  const [header, setHeader] = useState<PageHeaderState>({ title: "" });
  const [action, setAction] = useState<ReactNode>(null);

  // Stable identity so consumers don't re-render on every shell render.
  const headerCtx = useMemo(
    () => ({ header, setHeader, action, setAction }),
    [header, action],
  );

  // The zone used to force dark on the document while it was mounted. That
  // made the theme picker in its own sidebar menu a lie — three labels that
  // changed nothing while this ran — and it overrode a choice the person had
  // already made everywhere else in the app. The preference is global; a zone
  // is not the right level to have an opinion about it.
  useEffect(() => {
    applyThemePreference(readThemePreference());
  }, []);

  // The same mechanism `SidebarNav` already uses to know which workspace is
  // active — not a second one. `/provider`'s route guard requires a session
  // before this shell ever mounts, so `useUnreadCount` firing unconditionally
  // here (unlike the customer header's bell — see `NotificationBellLink`)
  // never queries for an anonymous visitor; while `activeProvider` is still
  // resolving, `providerId` is `""` and `useUnreadCount`'s own `enabled`
  // guard (`providerId.length > 0`) keeps it from firing early instead.
  const { activeProvider } = useActiveProvider();
  const providerId = activeProvider?.id ?? "";
  const unreadCount = useUnreadCount({ kind: "provider", providerId });

  return (
    <PageHeaderContext.Provider value={headerCtx}>
      <SidebarProvider>
        <AppSidebar />
        {/* The shell holds the viewport; only `main` scrolls. Before this the
            whole document scrolled, so the sidebar and the page header slid
            away with the content — on a dashboard, where those two are how you
            get anywhere, that is the navigation leaving exactly when a long
            page makes it useful. It also broke every `sticky` inside a page,
            which is why the settings rail appeared to come unstuck. */}
        <SidebarInset className="h-svh min-h-0 overflow-hidden">
          {/* Everything that is not the title stands down by breakpoint. On a
              390px screen the trigger, a separator, two lines of title, a
              64-unit search box, a bell and a New-service button were all
              competing for the same row: the title wrapped to four lines and
              pushed the header off its own height. What a person needs here on
              a phone is where they are and the way back to the menu. */}
          <header className="flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-border bg-background px-4 sm:px-6">
            <SidebarTrigger />
            <Separator orientation="vertical" className="hidden h-6 sm:block" />
            {/* `min-w-0` because a flex child defaults to `min-width: auto` and
                will not shrink below its own text — without it `truncate` on
                the lines inside never engages. */}
            <div className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-base font-semibold">
                {header.title}
              </span>
              {header.subtitle && (
                <span className="truncate text-xs text-muted-foreground">
                  {header.subtitle}
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <HeaderActions showAccount={false} />
              <div className="relative hidden lg:block">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  placeholder="Search…"
                  className="h-9 w-64 rounded-md border border-input bg-secondary pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <kbd className="absolute right-2 top-1/2 -translate-y-1/2 rounded border border-input bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  ⌘K
                </kbd>
              </div>
              {/* The workspace's own inbox, not the personal one —
                  `HeaderActions` above has `showAccount={false}`, which hides
                  its bell along with the avatar, so this is the only bell a
                  provider-zone screen renders. It used to be a hardcoded
                  button with a permanently-lit dot; now the dot is
                  `NotificationBell`'s real badge, sourced from the same
                  `useUnreadCount` this file already reads above, and the
                  control actually goes to the workspace's inbox. The 36px
                  square it sits in — border, radius, hover state — is
                  untouched: only what was inside it, and what it does, has
                  changed. */}
              <Link
                to="/provider/$slug/notifications"
                params={{ slug: activeProvider?.slug ?? "" }}
                aria-label={
                  unreadCount > 0
                    ? tNotifications("unreadBadge", { count: unreadCount })
                    : t("notifications")
                }
                className="relative hidden h-9 w-9 items-center justify-center rounded-md border border-input bg-secondary text-foreground hover:bg-accent sm:inline-flex"
              >
                <NotificationBell scope={{ kind: "provider", providerId }} />
              </Link>
              {action ?? (
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">New service</span>
                </button>
              )}
            </div>
          </header>
          <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </PageHeaderContext.Provider>
  );
}
