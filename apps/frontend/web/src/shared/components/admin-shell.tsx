import type { ReactNode } from "react";
import {
  Separator,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@ntizo/frontend-ui";
import { AppSidebar } from "@/shared/components/admin-sidebar/app-sidebar";
import { HeaderActions } from "@/shared/components/header-actions";

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="h-svh min-h-0 overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[var(--color-border)] px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-6" />
          <div className="ml-auto">
            <HeaderActions showAccount={false} />
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
