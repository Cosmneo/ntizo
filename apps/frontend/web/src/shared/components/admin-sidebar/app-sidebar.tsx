import {
  Sidebar,
  SidebarContent,
  SidebarRail,
  SidebarSeparator,
} from "@ntizo/frontend-ui";
import { AppSidebarHeader } from "./sidebar-header";
import { SidebarNav } from "./sidebar-nav";
import { SidebarUserMenu } from "./sidebar-user-menu";

export function AppSidebar() {
  return (
    <Sidebar collapsible="icon">
      <AppSidebarHeader />
      <SidebarSeparator />
      <SidebarContent>
        <SidebarNav />
      </SidebarContent>
      <SidebarSeparator />
      <SidebarUserMenu />
      <SidebarRail />
    </Sidebar>
  );
}
