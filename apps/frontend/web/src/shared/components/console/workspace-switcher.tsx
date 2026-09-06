import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { Check, Plus } from "lucide-react";
import {
  AvatarImage,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  cn,
} from "@ntizo/frontend-ui";
import { useActiveProvider } from "@/features/provider/viewmodel/use-active-provider";
import { useProviderDetail } from "@/features/provider/viewmodel/use-providers";
import { workspaceStatusBadgeKey } from "@/features/provider/domain/workspace-status";

/**
 * Switching workspace, as a sub-menu of the account menu.
 *
 * Here rather than in a block of its own under the masthead: the account and
 * its organizations belong together, and the workspace's name is already the
 * page title. Two controls for one thing is one too many.
 */
export function WorkspaceSwitcher() {
  const { t } = useTranslation("provider");
  const { providers, activeProvider, setActive } = useActiveProvider();
  // Cached alongside the settings page's own read; costs nothing extra here.
  const { data: detail } = useProviderDetail(activeProvider?.id);
  const nav = useNavigate();
  const orgInitials = (activeProvider?.name ?? "?").slice(0, 2).toUpperCase();

  return (
    <>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="py-2">
          {/* Only the active workspace gets a logo — the rows below would
              each cost a detail fetch to find theirs. */}
          <div className="mr-2 flex aspect-square h-7 w-7 items-center justify-center overflow-hidden rounded-md bg-primary/15 text-[11px] font-semibold text-primary">
            {detail?.logo?.url ? <AvatarImage src={detail.logo.url} alt="" /> : orgInitials}
          </div>
          <div className="flex flex-1 flex-col leading-tight">
            <span className="text-sm font-medium">{activeProvider?.name ?? t("noProvider")}</span>
            <span className="text-[11px] text-muted-foreground">{activeProvider?.role ?? ""}</span>
          </div>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-64">
          {providers.map((p) => {
            const isActive = p.id === activeProvider?.id;
            // Whether the platform has approved it — the thing the slug
            // cannot say. Two workspaces with one name and two slugs told you
            // they were different; neither told you only one is live.
            const badgeKey = workspaceStatusBadgeKey(p.status);
            return (
              <DropdownMenuItem key={p.id} onSelect={() => setActive(p.id)} className="py-2">
                <div className="mr-2 flex aspect-square h-7 w-7 items-center justify-center rounded-md bg-primary/15 text-[11px] font-semibold text-primary">
                  {p.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="truncate text-sm font-medium">{p.name}</span>
                  {/* The slug, not the role: unique by construction, and what
                      the address bar shows next. */}
                  <span className="truncate font-mono text-[11px] text-muted-foreground">{p.slug}</span>
                  {badgeKey && (
                    <span className="mt-0.5 w-fit rounded-full bg-[color-mix(in_srgb,var(--color-warning)_22%,transparent)] px-1.5 py-px text-[10px] font-medium text-[var(--color-foreground)]">
                      {t(badgeKey)}
                    </span>
                  )}
                </div>
                {isActive && <Check className="ml-2 h-4 w-4" />}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          {/* The wizard, not a dialog: a second workspace needs the same
              type, address, payout and documents as the first. */}
          <DropdownMenuItem onSelect={() => nav({ to: "/onboarding" })}>
            <Plus className="h-4 w-4" />
            {t("createNew")}
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
    </>
  );
}

/**
 * The same choice at the head of the phone's menu sheet, as plain rows. A
 * nested dropdown has no honest form under a thumb. Renders nothing when
 * there is only one workspace to be in.
 */
export function MobileWorkspaceSwitcher() {
  const { t } = useTranslation("provider");
  const { providers, activeProvider, setActive } = useActiveProvider();
  if (providers.length < 2) return null;

  return (
    <div className="mb-2 grid gap-1 border-b border-[var(--color-border)] pb-2">
      {providers.map((p) => {
        const isActive = p.id === activeProvider?.id;
        const badgeKey = workspaceStatusBadgeKey(p.status);
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => setActive(p.id)}
            aria-current={isActive ? "true" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-[var(--radius-field)] px-2 py-2 text-left",
              isActive && "bg-[var(--color-muted)]",
            )}
          >
            <span className="flex aspect-square h-7 w-7 items-center justify-center rounded-md bg-primary/15 text-[11px] font-semibold text-primary">
              {p.name.slice(0, 2).toUpperCase()}
            </span>
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-sm font-medium">{p.name}</span>
              <span className="truncate font-mono text-[11px] text-muted-foreground">
                {p.slug}
                {badgeKey && ` · ${t(badgeKey)}`}
              </span>
            </span>
            {isActive && <Check className="h-4 w-4 shrink-0" />}
          </button>
        );
      })}
    </div>
  );
}
