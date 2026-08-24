import { Sidebar, SidebarContent, SidebarRail } from "@ntizo/frontend-ui";
import { AppSidebarHeader } from "./sidebar-header";
import { SidebarNav } from "./sidebar-nav";
import { SidebarUserMenu } from "./sidebar-user-menu";

export function AppSidebar() {
  return (
    <Sidebar collapsible="icon">
      {/* One masthead, not two. A workspace block used to sit under the brand
          repeating the name and the zone — but switching workspace already
          lives in the user menu at the foot of this sidebar, where the account
          and its organizations belong together, and the workspace name is
          already the page title. Two controls for one thing is one too many. */}
      <AppSidebarHeader />
      <SidebarContent>
        <SidebarNav />
      </SidebarContent>
      <SidebarUserMenu />
      <SidebarRail />
    </Sidebar>
  );
}
