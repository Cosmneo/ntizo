import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  CalendarDays,
  Heart,
  LayoutGrid,
  LogOut,
  MessageSquare,
  Monitor,
  Moon,
  Palette,
  Shield,
  Sparkles,
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
} from "@ntizo/frontend-ui";
import { useCurrentUser } from "@/features/user/viewmodel/use-current-user";
import { useSignOut } from "@/features/user/viewmodel/use-sign-out";
import { useMyProviders } from "@/features/provider/viewmodel/use-providers";
import { canAccessAdmin, canAccessProvider } from "@/shared/lib/zones";
import { applyThemePreference, type ThemePreference } from "@/shared/lib/theme";

/** "Salif Faustino" → "SF"; falls back to the email when there is no name. */
function initialsOf(source: string): string {
  return source
    .split(" ")
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function UserMenu() {
  const { t } = useTranslation("common");
  const { t: ta } = useTranslation("auth");
  const { data: user = null } = useCurrentUser();
  const { data: providers = [] } = useMyProviders();
  const navigate = useNavigate();
  const signOut = useSignOut();

  if (!user) return null;

  const label = user.name || user.email || "";
  const initials = initialsOf(label);
  const showProvider = canAccessProvider(user, providers.length);
  const showAdmin = canAccessAdmin(user);

  async function handleSignOut() {
    const { serverRevokeFailed } = await signOut();
    if (serverRevokeFailed) toast.error(ta("signOutOffline"));
  }

  return (
    <DropdownMenu>
      {/* The label goes on the button, not on DropdownMenuTrigger: the
          trigger renders no element of its own, it clones this child to
          attach onClick, so any prop passed to it is silently dropped. */}
      <DropdownMenuTrigger>
        {/* Initials only. The full name lives inside the menu, on the row
            that also carries the email — repeating it on the trigger spent
            header width on something the user already knows. */}
        <button
          type="button"
          aria-label={t("accountMenu")}
          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2"
        >
          <Avatar className="h-10 w-10">
            <AvatarFallback className="type-body-medium bg-[var(--color-primary)] font-semibold text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="px-2 py-2">
          <div className="flex items-center gap-2">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-[var(--color-primary)] text-xs font-semibold text-white">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="grid leading-tight">
              <span className="truncate text-sm font-semibold text-[var(--color-foreground)]">
                {user.name ?? ""}
              </span>
              <span className="truncate text-[11px] font-normal text-[var(--color-muted-foreground)]">
                {user.email ?? ""}
              </span>
            </div>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={() => navigate({ to: "/account" })}>
          <UserIcon className="mr-2 h-4 w-4" />
          {t("myAccount")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate({ to: "/bookings" })}>
          <CalendarDays className="mr-2 h-4 w-4" />
          {t("myBookings")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate({ to: "/messages" })}>
          <MessageSquare className="mr-2 h-4 w-4" />
          {t("messages")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate({ to: "/favourites" })}>
          <Heart className="mr-2 h-4 w-4" />
          {t("favourites")}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Exactly one of these two shows. Both point at /provider, which
            already decides: it redirects to the dashboard for someone who
            owns a provider and to the create-one page for someone who does
            not, so the label is the only thing that differs. */}
        {showProvider ? (
          <DropdownMenuItem onSelect={() => navigate({ to: "/provider" })}>
            <LayoutGrid className="mr-2 h-4 w-4" />
            {t("providerDashboard")}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => navigate({ to: "/provider" })}>
            <Sparkles className="mr-2 h-4 w-4" />
            {t("becomeProvider")}
          </DropdownMenuItem>
        )}

        {/* Only rendered for admins. The route guards itself as well — this is
            the affordance, not the control. */}
        {showAdmin ? (
          <DropdownMenuItem onSelect={() => navigate({ to: "/admin" })}>
            <Shield className="mr-2 h-4 w-4" />
            {t("adminDashboard")}
          </DropdownMenuItem>
        ) : null}

        <DropdownMenuSeparator />

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Palette className="mr-2 h-4 w-4" />
            {t("appearance")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-44">
            {(
              [
                ["light", Sun, "themeLight"],
                ["dark", Moon, "themeDark"],
                ["system", Monitor, "themeSystem"],
              ] as Array<[ThemePreference, typeof Sun, string]>
            ).map(([value, Icon, key]) => (
              <DropdownMenuItem key={value} onSelect={() => applyThemePreference(value)}>
                <Icon className="mr-2 h-4 w-4" />
                {t(key)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onSelect={() => void handleSignOut()}
          className="text-[var(--color-destructive)]"
        >
          <LogOut className="mr-2 h-4 w-4" />
          {ta("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
