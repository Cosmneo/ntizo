import { useTranslation } from "react-i18next";
import { SidebarHeader, SidebarMenu, SidebarMenuItem } from "@ntizo/frontend-ui";

/**
 * The zone's masthead: the wordmark, and which zone this is.
 *
 * No coloured tile. There was one — a brand-blue square with the mark inside —
 * and it came from the sidebar template rather than from any decision here. It
 * cost twice: the mark was navy on blue and barely legible, and squeezing a
 * logo into a 20px square makes it a texture rather than a logo. The wordmark
 * is the thing people recognise, so it is what shows.
 *
 * Collapsed to icons the wordmark has nowhere to go, so the mark alone takes
 * over — still with no tile behind it.
 */
export function AppSidebarHeader() {
  const { t } = useTranslation("provider");
  return (
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <div className="flex items-center gap-2.5 px-2 py-2">
            <img
              src="/brand/icon-primary.svg"
              alt=""
              aria-hidden="true"
              className="hidden size-9 shrink-0 group-data-[collapsible=icon]:block"
            />
            <div className="grid gap-1 group-data-[collapsible=icon]:hidden">
              <img src="/brand/logo-primary.svg" alt="Ntizo" className="h-8 w-auto" />
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
