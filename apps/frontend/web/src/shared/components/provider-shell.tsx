import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Bell, Plus, Search } from "lucide-react";
import {
  Separator,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@ntizo/frontend-ui";
import { AppSidebar } from "@/shared/components/app-sidebar/app-sidebar";
import { HeaderActions } from "@/shared/components/header-actions";
import {
  PageHeaderContext,
  type PageHeaderState,
} from "@/shared/lib/page-header";
import {
  applyThemePreference,
  readThemePreference,
} from "@/shared/lib/theme";

export function ProviderShell({ children }: { children: ReactNode }) {
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

  return (
    <PageHeaderContext.Provider value={headerCtx}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-border bg-background px-6">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-6" />
            <div className="flex flex-col leading-tight">
              <span className="text-base font-semibold">{header.title}</span>
              {header.subtitle && (
                <span className="text-xs text-muted-foreground">
                  {header.subtitle}
                </span>
              )}
            </div>
            <div className="ml-auto flex items-center gap-3">
            <HeaderActions currentZone="provider" showAccount={false} />
            <div className="relative">
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
            <button
              type="button"
              aria-label="Notifications"
              className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-secondary text-foreground hover:bg-accent"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" />
            </button>
            {action ?? (
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <Plus className="h-4 w-4" />
                New service
              </button>
            )}
          </div>
        </header>
          <main className="flex-1 p-6">
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </PageHeaderContext.Provider>
  );
}
