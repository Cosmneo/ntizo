import { useTranslation } from "react-i18next";
import { SidebarHeader, SidebarMenu, SidebarMenuItem } from "@ntizo/frontend-ui";
import { NtizoIcon } from "@/shared/components/icons";

export function AppSidebarHeader() {
  const { t } = useTranslation("provider");
  return (
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <div className="flex items-center gap-2 px-2 py-1.5">
            <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-[var(--color-sidebar-primary)] text-[var(--color-sidebar-primary-foreground)]">
              <NtizoIcon className="size-5" />
            </div>
            <div className="grid flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate font-semibold text-sm text-[var(--color-sidebar-primary)]">
                Ntizo
              </span>
              <span className="truncate text-[11px] text-[var(--color-muted-foreground)]">
                {t("providerConsole")}
              </span>
            </div>
          </div>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
  );
}
