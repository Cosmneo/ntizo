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
import { useActiveProvider } from "@/features/provider/viewmodel/use-active-provider";
import { useProviderDetail } from "@/features/provider/viewmodel/use-providers";
import { CreateProviderDialog } from "@/features/provider/ui/create-provider-dialog";

export function SidebarProviderSwitcher() {
  const { t } = useTranslation("provider");
  const { providers, activeProvider, setActive } = useActiveProvider();
  // Only for the logo. The switcher list itself comes from the cheap `mine`
  // query — one detail fetch for the workspace already on screen is worth a
  // recognisable mark; nine would not be.
  const { data: detail } = useProviderDetail(activeProvider?.id);
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
                <div className="flex aspect-square size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[var(--color-sidebar-accent)] text-[var(--color-sidebar-accent-foreground)] text-xs font-semibold">
                  {detail?.logo?.url ? (
                    <img
                      src={detail.logo.url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    (activeProvider?.name ?? "?").slice(0, 2).toUpperCase()
                  )}
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold text-sm">
                    {activeProvider?.name ?? t("noProvider")}
                  </span>
                  {activeProvider && (
                    // The zone, not the type and role. Those two are on the
                    // dropdown rows below where they distinguish one workspace
                    // from another; up here the useful fact is which part of
                    // the app you are standing in, since the same shell serves
                    // the customer, provider and admin zones.
                    // The zone, not the type and role. Those two are on the
                    // dropdown rows below, where they distinguish one workspace
                    // from another; up here the useful fact is which part of the
                    // app you are standing in, since one shell serves the
                    // customer, provider and admin zones. The slug is not
                    // repeated — it is already in the address bar, and at this
                    // width the full path only ever renders as an ellipsis.
                    <span className="truncate font-mono text-[11px] text-[var(--color-muted-foreground)]">
                      /provider
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
                <Plus className="h-4 w-4" />
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
