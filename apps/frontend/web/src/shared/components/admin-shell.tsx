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
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[var(--color-border)] px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-6" />
          <div className="ml-auto">
            <HeaderActions currentZone="admin" showAccount={false} />
          </div>
        </header>
        <main className="flex-1 p-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
