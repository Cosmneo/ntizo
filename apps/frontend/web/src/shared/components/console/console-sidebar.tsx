import type { ReactNode } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarRail,
} from "@ntizo/frontend-ui";
import type { ConsoleNav } from "@/shared/lib/console-nav";
import { ConsoleNavItems } from "./console-nav-items";
import { ConsoleUserMenu } from "./console-user-menu";

/**
 * The console's sidebar: one masthead, the menu, the account at the foot.
 *
 * The masthead is the wordmark and which zone this is. No coloured tile — a
 * logo squeezed into a 20px square is a texture, not a logo. Collapsed to
 * icons the wordmark has nowhere to go, so the mark alone takes over.
 *
 * `workspaceMenu` is the zone's contribution to the account menu — the
 * switcher, for a workspace; nothing, for the platform. This component does
 * not know which it is in.
 */
export function ConsoleSidebar({
  nav,
  slug,
  zoneLabel,
  workspaceMenu,
}: {
  nav: ConsoleNav;
  slug: string | undefined;
  zoneLabel: string;
  workspaceMenu?: ReactNode;
}) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-2.5 px-2 py-2">
              <img
                src="/brand/icon-primary.svg"
                alt=""
                aria-hidden="true"
                className="hidden h-8 w-auto shrink-0 group-data-[collapsible=icon]:block"
              />
              <div className="grid gap-1 group-data-[collapsible=icon]:hidden">
                <img src="/brand/logo-primary.svg" alt="Ntizo" className="h-7 w-auto" />
                <span className="truncate text-[11px] text-[var(--color-muted-foreground)]">{zoneLabel}</span>
              </div>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <ConsoleNavItems nav={nav} slug={slug} />
      </SidebarContent>
      <ConsoleUserMenu ns={nav.ns}>{workspaceMenu}</ConsoleUserMenu>
      <SidebarRail />
    </Sidebar>
  );
}
