import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  ChevronsUpDown,
  LogOut,
  Monitor,
  Moon,
  Palette,
  Plus,
  Sun,
  User as UserIcon,
} from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
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
import { useActiveProvider } from "@/features/provider/viewmodel/use-active-provider";
import { useProviderDetail } from "@/features/provider/viewmodel/use-providers";
import { applyThemePreference } from "@/shared/lib/theme";

export function SidebarUserMenu() {
  const { t } = useTranslation("provider");
  const { t: ta } = useTranslation("auth");
  const { t: tc } = useTranslation("common");
  const { data: user } = useCurrentUser();
  const { providers, activeProvider, setActive } = useActiveProvider();
  // Cached alongside the settings page's own read; costs nothing extra here.
  const { data: detail } = useProviderDetail(activeProvider?.id);
  const nav = useNavigate();
  const signOut = useSignOut();

  async function handleSignOut() {
    const { serverRevokeFailed } = await signOut();
    if (serverRevokeFailed) {
      toast.error(ta("signOutOffline"));
    }
  }

  const initials = (user?.name ?? user?.email ?? "?")
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const orgInitials = (activeProvider?.name ?? "?").slice(0, 2).toUpperCase();

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
                  {user?.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={user.name ?? ""} /> : null}
                  <AvatarFallback className="text-xs">
                    {initials}
                  </AvatarFallback>
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
                    {user?.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={user.name ?? ""} /> : null}
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

              {/* The workspace comes first: this menu sits inside a workspace
                  and switching one is the thing most often wanted here. */}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="py-2">
                  {/* The logo, where the sidebar can still show one. It used to
                      have a block of its own at the top of the sidebar; that
                      block duplicated a switcher this menu already is, so it
                      went, and this is the mark's remaining home in the chrome.
                      Only the active workspace gets one — the rows below would
                      each cost a detail fetch to find theirs. */}
                  <div className="mr-2 flex aspect-square h-7 w-7 items-center justify-center overflow-hidden rounded-md bg-primary/15 text-[11px] font-semibold text-primary">
                    {detail?.logo?.url ? (
                      <AvatarImage src={detail.logo.url} alt="" />
                    ) : (
                      orgInitials
                    )}
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
                        <div className="flex min-w-0 flex-1 flex-col leading-tight">
                          <span className="truncate text-sm font-medium">
                            {p.name}
                          </span>
                          {/* The slug, not the role. Several workspaces can
                              share a name — and here nine did — which turned
                              this list into nine identical rows and made the
                              switch look broken, because nothing visibly
                              changed after picking one. The slug is unique by
                              construction and is what the address bar shows
                              next, so it is both the discriminator and a
                              preview of where the click lands. */}
                          <span className="truncate font-mono text-[11px] text-muted-foreground">
                            {p.slug}
                          </span>
                        </div>
                        {isActive && <Check className="ml-2 h-4 w-4" />}
                      </DropdownMenuItem>
                    );
                  })}
                  <DropdownMenuSeparator />
                  {/* The wizard, not a dialog. A second workspace needs the
                      same type, address, payout and documents as the first — a
                      two-field modal collected none of it and left the new
                      provider half-made, with no screen that said so. */}
                  <DropdownMenuItem onSelect={() => nav({ to: "/onboarding" })}>
                    <Plus className="h-4 w-4" />
                    {t("createNew")}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuSeparator />

              {/* Both of these leave the workspace, and that is the point. An
                  account belongs to a person; this zone belongs to an
                  organization. Keeping them here rather than in the sidebar is
                  what keeps the sidebar about the business. */}
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
                  {/* These did nothing at all before — three labels wired to no
                      handler. A theme picker that leaves the theme alone is
                      worse than no theme picker. */}
                  <DropdownMenuItem
                    onSelect={() => applyThemePreference("light")}
                  >
                    <Sun className="h-4 w-4" />
                    {tc("themeLight")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => applyThemePreference("dark")}
                  >
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
