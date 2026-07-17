import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import {
  Check,
  ChevronsUpDown,
  LogOut,
  Monitor,
  Moon,
  Palette,
  Plus,
  Settings,
  Sun,
  User as UserIcon,
} from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@ntizo/frontend-ui";
import { authClient } from "@/shared/lib/api/auth-client";
import { useCurrentUser } from "@/features/account/hooks/use-current-user";
import { useActiveProvider } from "@/features/provider/hooks/use-active-provider";
import { CreateProviderDialog } from "@/features/provider/components/create-provider-dialog";

export function SidebarUserMenu() {
  const { t } = useTranslation("provider");
  const { t: ta } = useTranslation("auth");
  const { data: user } = useCurrentUser();
  const { providers, activeProvider, setActive } = useActiveProvider();
  const [dialogOpen, setDialogOpen] = useState(false);
  const nav = useNavigate();

  async function handleSignOut() {
    await authClient.signOut();
    nav({ to: "/sign-in" });
  }

  const initials = (user?.name ?? user?.email ?? "?")
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const orgInitials = (activeProvider?.name ?? "?")
    .slice(0, 2)
    .toUpperCase();

  return (
    <SidebarFooter>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger>
              <SidebarMenuButton
                size="lg"
                tooltip={user?.name ?? user?.email ?? ""}
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-sm font-semibold">
                    {user?.name ?? ""}
                  </span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    {user?.email ?? ""}
                  </span>
                </div>
                <ChevronsUpDown className="ml-auto size-4 opacity-60" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-64" side="right">
              <DropdownMenuLabel className="px-2 py-2">
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="grid leading-tight">
                    <span className="text-sm font-semibold text-foreground">
                      {user?.name ?? ""}
                    </span>
                    <span className="text-[11px] font-normal text-muted-foreground">
                      {user?.email ?? ""}
                    </span>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />

              <DropdownMenuItem onSelect={() => nav({ to: "/provider/account" })}>
                <UserIcon className="mr-2 h-4 w-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => nav({ to: "/provider/settings" })}>
                <Settings className="mr-2 h-4 w-4" />
                {t("settings")}
              </DropdownMenuItem>

              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Palette className="mr-2 h-4 w-4" />
                  Theme
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-44">
                  <DropdownMenuItem>
                    <Sun className="mr-2 h-4 w-4" />
                    Light
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Moon className="mr-2 h-4 w-4" />
                    Dark
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Monitor className="mr-2 h-4 w-4" />
                    System
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="py-2">
                  <div className="mr-2 flex aspect-square h-7 w-7 items-center justify-center rounded-md bg-primary/15 text-[11px] font-semibold text-primary">
                    {orgInitials}
                  </div>
                  <div className="flex flex-1 flex-col leading-tight">
                    <span className="text-sm font-medium">
                      {activeProvider?.name ?? t("noProvider")}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {activeProvider?.role ?? ""}
                    </span>
                  </div>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-64">
                  {providers.map((p) => {
                    const isActive = p.id === activeProvider?.id;
                    return (
                      <DropdownMenuItem
                        key={p.id}
                        onSelect={() => setActive(p.id)}
                        className="py-2"
                      >
                        <div className="mr-2 flex aspect-square h-7 w-7 items-center justify-center rounded-md bg-primary/15 text-[11px] font-semibold text-primary">
                          {p.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex flex-1 flex-col leading-tight">
                          <span className="text-sm font-medium">{p.name}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {p.role}
                          </span>
                        </div>
                        {isActive && <Check className="ml-2 h-4 w-4" />}
                      </DropdownMenuItem>
                    );
                  })}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    {t("createNew")}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={handleSignOut}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="mr-2 h-4 w-4" />
                {ta("signOut")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
      <CreateProviderDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </SidebarFooter>
  );
}
