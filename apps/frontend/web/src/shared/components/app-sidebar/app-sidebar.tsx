import { Sidebar, SidebarContent, SidebarRail, SidebarSeparator } from "@ntizo/frontend-ui";
import { AppSidebarHeader } from "./sidebar-header";
import { SidebarProviderSwitcher } from "./sidebar-provider-switcher";
import { SidebarNav } from "./sidebar-nav";
import { SidebarUserMenu } from "./sidebar-user-menu";

export function AppSidebar() {
  return (
    <Sidebar collapsible="icon">
      {/* Two mastheads, and they answer different questions. The brand says
          which product this is; the switcher says which workspace you are
          standing in and lets you change it. Collapsing them into one would
          mean either the wordmark or the workspace name has to go, and the
          workspace name is the one people navigate by. */}
      <AppSidebarHeader />
      <SidebarProviderSwitcher />
      <SidebarSeparator className="mx-2 my-1" />
      <SidebarContent>
        <SidebarNav />
      </SidebarContent>
      <SidebarUserMenu />
      <SidebarRail />
    </Sidebar>
  );
}
