import { useTranslation } from "react-i18next";
import { SidebarHeader, SidebarMenu, SidebarMenuItem } from "@ntizo/frontend-ui";

/**
 * The zone's masthead: the wordmark, and which zone this is.
 *
 * Same shape as the provider sidebar's, and same reasoning: the coloured tile
 * came from the sidebar template rather than from a decision, and it cost twice
 * — the mark inside it was navy on brand blue, and a logo squeezed into a 20px
 * square is a texture, not a logo.
 */
export function AppSidebarHeader() {
  const { t } = useTranslation("admin");
  return (
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
              <span className="truncate text-[11px] text-[var(--color-muted-foreground)]">
                {t("adminConsole", { defaultValue: "Admin" })}
              </span>
            </div>
          </div>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
  );
}
