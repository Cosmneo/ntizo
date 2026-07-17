import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { ChevronsUpDown, LogOut, User as UserIcon, Palette, Languages } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@ntizo/frontend-ui";
import { authClient } from "@/shared/lib/api/auth-client";
import { useCurrentUser } from "@/features/admin/dashboard/hooks/use-current-user";

export function SidebarUserMenu() {
  const { t: ta } = useTranslation("auth");
  const { data: user } = useCurrentUser();
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
                  <span className="truncate font-semibold text-sm">
                    {user?.name ?? ""}
                  </span>
                  <span className="truncate text-[11px] text-[var(--color-muted-foreground)]">
                    {user?.email ?? ""}
                  </span>
                </div>
                <ChevronsUpDown className="ml-auto size-4 opacity-60" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end">
              <DropdownMenuLabel>{user?.email ?? ""}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <UserIcon className="mr-2 h-4 w-4" />
                My Account
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Palette className="mr-2 h-4 w-4" />
                Theme
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Languages className="mr-2 h-4 w-4" />
                Language
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                {ta("signOut")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
}
