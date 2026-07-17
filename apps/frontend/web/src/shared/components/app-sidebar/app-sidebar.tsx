import {
  Sidebar,
  SidebarContent,
  SidebarRail,
} from "@ntizo/frontend-ui";
import { AppSidebarHeader } from "./sidebar-header";
import { SidebarNav } from "./sidebar-nav";
import { SidebarUserMenu } from "./sidebar-user-menu";

export function AppSidebar() {
  return (
    <Sidebar collapsible="icon">
      <AppSidebarHeader />
      <SidebarContent>
        <SidebarNav />
      </SidebarContent>
      <SidebarUserMenu />
      <SidebarRail />
    </Sidebar>
  );
}
