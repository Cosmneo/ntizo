import type { ReactNode } from "react";
import { Separator, SidebarTrigger } from "@ntizo/frontend-ui";
import { HeaderActions } from "@/shared/components/header-actions";
import { usePageHeaderAction, usePageHeaderValue } from "@/shared/lib/page-header";

/**
 * The row at the top of every console screen: where you are, and the one
 * action this page offers.
 *
 * Two things that used to be here are gone. A search field with a ⌘K badge
 * wired to nothing, and a "New service" button that was the *fallback*
 * whenever a page set no action — so it rendered on Wallet, on Activity, on
 * Settings, and did nothing anywhere. A control that lies about being one is
 * worse than no control. A page with no action now shows no button.
 *
 * The sidebar trigger hides below `md`: there is no sidebar to toggle there,
 * the tab bar and its Menu sheet are the navigation. The bell does not hide
 * on any width — Notifications has left the sidebar and has no tab, so this
 * is the only route to the inbox on a phone.
 */
export function ConsoleHeader({ bell }: { bell: ReactNode }) {
  const header = usePageHeaderValue();
  const action = usePageHeaderAction();

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-border bg-background px-4 md:px-6">
      <SidebarTrigger className="hidden md:inline-flex" />
      <Separator orientation="vertical" className="hidden h-6 md:block" />
      {/* `min-w-0` because a flex child defaults to `min-width: auto` and
          will not shrink below its own text — without it `truncate` never
          engages. */}
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-base font-semibold">{header.title}</span>
        {header.subtitle && (
          <span className="truncate text-xs text-muted-foreground">{header.subtitle}</span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2 md:gap-3">
        <HeaderActions showAccount={false} />
        {bell}
        {action}
      </div>
    </header>
  );
}
