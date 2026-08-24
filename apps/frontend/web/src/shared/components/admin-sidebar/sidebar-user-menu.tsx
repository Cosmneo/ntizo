import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ArrowLeft,
  ChevronsUpDown,
  LogOut,
  Monitor,
  Moon,
  Palette,
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
import { useCurrentUser } from "@/features/user/viewmodel/use-current-user";
import { useSignOut } from "@/features/user/viewmodel/use-sign-out";
import { initialsFrom } from "@/shared/lib/initials";
import { applyThemePreference } from "@/shared/lib/theme";

/**
 * The signed-in person's menu, at the foot of the administration sidebar.
 *
 * Deliberately the provider zone's menu minus the workspace switcher, which is
 * the one thing here that belongs to a business rather than a person. It opens
 * to the right for the same reason that one does: the trigger is the last
 * thing in a sidebar pinned to the left edge, so a menu anchored to its right
 * edge unfolds back across the sidebar it came from and off the screen.
 *
 * It used to be a stub — "My Account", "Theme" and "Language" in English in an
 * otherwise translated interface, none of the three wired to anything, sitting
 * above a "Sair" that worked. Language is gone rather than implemented: it is
 * in the header of every page in this zone already, and a second control for
 * it here is one more thing to keep in step for no gain.
 */
export function SidebarUserMenu() {
  const { t } = useTranslation("admin");
  const { t: ta } = useTranslation("auth");
  const { t: tc } = useTranslation("common");
  const { data: user } = useCurrentUser();
  const nav = useNavigate();
  const signOut = useSignOut();

  async function handleSignOut() {
    const { serverRevokeFailed } = await signOut();
    if (serverRevokeFailed) {
      toast.error(ta("signOutOffline"));
    }
  }

  const initials = initialsFrom(user?.name ?? user?.email ?? "?");

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
              <DropdownMenuLabel className="px-3 py-3">
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs">
                      {initials}
                    </AvatarFallback>
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

              {/* Both of these leave the zone, and that is the point: an
                  account belongs to a person, this zone belongs to the
                  platform. Keeping them here is what keeps the sidebar about
                  administration. */}
              <DropdownMenuItem onSelect={() => nav({ to: "/account" })}>
                <UserIcon className="h-4 w-4" />
                {t("nav.myAccount")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => nav({ to: "/" })}>
                <ArrowLeft className="h-4 w-4" />
                {t("backToApp")}
              </DropdownMenuItem>

              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Palette className="h-4 w-4" />
                  {tc("appearance")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-44">
                  <DropdownMenuItem
                    onSelect={() => applyThemePreference("light")}
                  >
                    <Sun className="h-4 w-4" />
                    {tc("themeLight")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => applyThemePreference("dark")}>
                    <Moon className="h-4 w-4" />
                    {tc("themeDark")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => applyThemePreference("system")}
                  >
                    <Monitor className="h-4 w-4" />
                    {tc("themeSystem")}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={handleSignOut}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="h-4 w-4" />
                {ta("signOut")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
}
