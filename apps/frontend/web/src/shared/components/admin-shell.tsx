import { useMemo, useState, type ReactNode } from "react";
import {
  Separator,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@ntizo/frontend-ui";
import { AppSidebar } from "@/shared/components/admin-sidebar/app-sidebar";
import { HeaderActions } from "@/shared/components/header-actions";
import { PageHeaderContext, type PageHeaderState } from "@/shared/lib/page-header";

/**
 * The administration zone's chrome.
 *
 * Deliberately the same shape as `ProviderShell`: the same header height, the
 * same page title and subtitle, the same slot for a page action. It had none of
 * that — pages called `usePageHeader` and nothing rendered it, so every admin
 * screen opened with an empty bar while the provider zone showed where you
 * were. Somebody moving between the two zones should not have to relearn where
 * anything is.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const [header, setHeader] = useState<PageHeaderState>({ title: "" });
  const [action, setAction] = useState<ReactNode>(null);

  // Stable identity so consumers do not re-render on every shell render.
  const headerCtx = useMemo(
    () => ({ header, setHeader, action, setAction }),
    [header, action],
  );

  return (
    <PageHeaderContext.Provider value={headerCtx}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="h-[calc(100svh-3.5rem)] min-h-0 overflow-hidden md:h-svh">
          <header className="flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-border bg-background px-4 sm:px-6">
            <SidebarTrigger />
            <Separator orientation="vertical" className="hidden h-6 sm:block" />
            <div className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-base font-semibold">{header.title}</span>
              {header.subtitle && (
                <span className="truncate text-xs text-muted-foreground">
                  {header.subtitle}
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <HeaderActions showAccount={false} />
              {action}
            </div>
          </header>
          <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </PageHeaderContext.Provider>
  );
}
