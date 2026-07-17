import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronsUpDown, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@ntizo/frontend-ui";
import { useActiveProvider } from "@/features/provider/hooks/use-active-provider";
import { CreateProviderDialog } from "@/features/provider/components/create-provider-dialog";

export function SidebarProviderSwitcher() {
  const { t } = useTranslation("provider");
  const { providers, activeProvider, setActive } = useActiveProvider();
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <SidebarGroup className="py-0">
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger>
              <SidebarMenuButton
                size="lg"
                tooltip={activeProvider?.name ?? t("noProvider")}
                className="data-[state=open]:bg-[var(--color-sidebar-accent)]"
              >
                <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-[var(--color-sidebar-accent)] text-[var(--color-sidebar-accent-foreground)] text-xs font-semibold">
                  {(activeProvider?.name ?? "?").slice(0, 2).toUpperCase()}
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold text-sm">
                    {activeProvider?.name ?? t("noProvider")}
                  </span>
                  {activeProvider && (
                    <span className="truncate text-[11px] text-[var(--color-muted-foreground)]">
                      {activeProvider.type} · {activeProvider.role}
                    </span>
                  )}
                </div>
                <ChevronsUpDown className="ml-auto size-4 opacity-60" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-64">
              {providers.length > 0 && (
                <>
                  <DropdownMenuLabel>{t("providerConsole")}</DropdownMenuLabel>
                  {providers.map((p) => (
                    <DropdownMenuItem
                      key={p.id}
                      onSelect={() => setActive(p.id)}
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">{p.name}</span>
                        <span className="text-[11px] text-[var(--color-muted-foreground)]">
                          {p.type} · {p.role}
                        </span>
                      </div>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onSelect={() => setDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                {t("createNew")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
      <CreateProviderDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </SidebarGroup>
  );
}
